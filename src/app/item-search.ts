import { type Searched, searchWords, wordsHeld } from '../core/search-words.ts';
import type { Context } from './context.ts';

// A search of what was concluded before looks in the items too: a decision is often made in an
// item's thread (a note and its answer, a question to the person, a handoff or send-back note),
// not in a topic (P3C-R2-8).

// What an entry of an item is: the item's own words (its title, a field), the person's (an answer
// to a question, a note, the note of a move such as a send-back), or an agent's (a question, a
// reply to a note, a handoff note).
export type SaidKind =
  | 'item'
  | 'answer'
  | 'note'
  | 'move'
  | 'question'
  | 'reply'
  | 'handoff'
  | 'other';

// An entry found: what it says, by whom, when and what it is; `person`, whether the person said it
// (an answer an agent noted from the chat is theirs too, `via` that agent).
export type ItemSaid = {
  said: string;
  by: string;
  at: string;
  kind: SaidKind;
  person: boolean;
  via?: string;
};

// An item found: the entry that holds the most words searched, and `theirs`, the person's own that
// holds the most, when that is another (P3C-R3-13): a decision is the person's, and an agent's
// note holding more of the words never hides it.
export type ItemHit = { id: string; title: string } & ItemSaid & { theirs?: ItemSaid };

export const ITEM_HITS_AT_MOST = 5;

const SAID_MAX = 200;

type Said = Omit<ItemSaid, 'said'> & { text: string };

const short = (text: string) => {
  const line = text.trim().replace(/\s+/g, ' ');
  return line.length <= SAID_MAX ? line : `${line.slice(0, SAID_MAX - 1).trimEnd()}…`;
};

// What an event of the item's thread says: its text, or its note when that is words (a handoff's
// or a send-back's), never a note's number.
function textOf(data: Record<string, unknown>): string | undefined {
  if (typeof data.text === 'string' && data.text.trim() !== '') return data.text;
  if (typeof data.note === 'string' && data.note.trim() !== '') return data.note;
  return undefined;
}

function kindOf(type: string, person: boolean): SaidKind {
  if (type === 'question_answered') return 'answer';
  if (type === 'question_asked') return 'question';
  if (type === 'note_left') return 'note';
  if (type === 'note_answered') return 'reply';
  if (type === 'transitioned') return person ? 'move' : 'handoff';
  return 'other';
}

// Of two entries, the one an item says best: the most words searched, the person's before an
// agent's, the latest of those.
function better(searched: Searched) {
  return (kept: Said, each: Said): Said => {
    const diff = wordsHeld(each.text, searched) - wordsHeld(kept.text, searched);
    if (diff !== 0) return diff > 0 ? each : kept;
    if (each.person !== kept.person) return each.person ? each : kept;
    return each.at >= kept.at ? each : kept;
  };
}

function saidOf({ text, ...rest }: Said): ItemSaid {
  return { said: short(text), ...rest };
}

// The items whose title, fields or thread hold any of the words searched, the one that holds the
// most first, then the one that said it last; five at most.
export function searchItems(ctx: Context, search: string): ItemHit[] {
  const searched = searchWords(search);
  if (searched.length === 0) return [];
  const items = ctx.db
    .prepare('SELECT id, title, fields, created_at, created_by_name FROM items ORDER BY id')
    .all() as {
    id: string;
    title: string;
    fields: string;
    created_at: string;
    created_by_name: string;
  }[];
  const threads = new Map<string, Said[]>();
  const events = ctx.db
    .prepare('SELECT item_id, type, actor_kind, actor_name, at, data FROM events ORDER BY id')
    .all() as {
    item_id: string;
    type: string;
    actor_kind: string;
    actor_name: string;
    at: string;
    data: string;
  }[];
  for (const event of events) {
    const data = JSON.parse(event.data) as Record<string, unknown>;
    const text = textOf(data);
    if (text === undefined) continue;
    const person = event.actor_kind === 'human';
    const via = typeof data.via === 'string' ? { via: data.via } : {};
    const kind = kindOf(event.type, person);
    const thread = threads.get(event.item_id) ?? [];
    thread.push({ text, by: event.actor_name, at: event.at, kind, person, ...via });
    threads.set(event.item_id, thread);
  }
  const best = better(searched);
  const hits = items.flatMap((item) => {
    const fields = Object.values(JSON.parse(item.fields || '{}') as Record<string, unknown>);
    const own = [item.title, ...fields.filter((value) => typeof value === 'string')].map(
      (text): Said => ({
        text,
        by: item.created_by_name,
        at: item.created_at,
        kind: 'item',
        person: false,
      }),
    );
    const thread = threads.get(item.id) ?? [];
    const all = [...own, ...thread];
    const score = wordsHeld(all.map(({ text }) => text).join('\n'), searched);
    if (score === 0) return [];
    const top = all.reduce(best);
    const persons = thread.filter((each) => each.person && wordsHeld(each.text, searched) > 0);
    const theirs = top.person || persons.length === 0 ? undefined : persons.reduce(best);
    const hit: ItemHit = {
      id: item.id,
      title: item.title,
      ...saidOf(top),
      ...(theirs ? { theirs: saidOf(theirs) } : {}),
    };
    return [{ hit, score }];
  });
  return hits
    .sort((a, b) => b.score - a.score || b.hit.at.localeCompare(a.hit.at))
    .slice(0, ITEM_HITS_AT_MOST)
    .map(({ hit }) => hit);
}

// What an entry is and who said it, as an agent reads it before its words; nothing for the item's
// own words.
function whoSaid({ by, kind, via }: ItemSaid): string | undefined {
  if (kind === 'item') return undefined;
  if (kind === 'answer')
    return via ? `the person's answer (noted from the chat by ${via})` : "the person's answer";
  if (kind === 'note') return "the person's note";
  if (kind === 'move') return "the person's note on a move";
  if (kind === 'question') return `${by}'s question`;
  if (kind === 'reply') return `${by}'s reply`;
  if (kind === 'handoff') return `${by}'s handoff note`;
  return by;
}

function saidLine(said: ItemSaid): string {
  const who = whoSaid(said);
  return `    ${who ? `${who}: ` : ''}${said.said}`;
}

// An item found as its lines: `head` (its id and title), then what it said, unless that is its
// title, and the person's own words beside it.
export function itemHitLines(hit: ItemHit, head = `${hit.id}  ${hit.title}`): string[] {
  return [
    head,
    ...(hit.said === hit.title ? [] : [saidLine(hit)]),
    ...(hit.theirs ? [saidLine(hit.theirs)] : []),
  ];
}

// The items found, after the topics.
export function itemHitsText(hits: readonly ItemHit[]): string {
  if (hits.length === 0) return '';
  return [
    "In the items' threads (otea show <id>):",
    ...hits.flatMap((hit) => itemHitLines(hit)),
  ].join('\n');
}
