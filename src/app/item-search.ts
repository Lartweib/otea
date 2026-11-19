import { searchWords, wordsHeld } from '../core/search-words.ts';
import type { Context } from './context.ts';

// A search of what was concluded before looks in the items too: a decision is often made in an
// item's thread (a note and its answer, a question to the person, a handoff or send-back note),
// not in a topic (P3C-R2-8).

// An item found: what it says that holds the most words searched, by whom and when.
export type ItemHit = { id: string; title: string; said: string; by: string; at: string };

export const ITEM_HITS_AT_MOST = 5;

const SAID_MAX = 200;

type Said = { text: string; by: string; at: string };

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
    .prepare('SELECT item_id, actor_name, at, data FROM events ORDER BY id')
    .all() as { item_id: string; actor_name: string; at: string; data: string }[];
  for (const event of events) {
    const text = textOf(JSON.parse(event.data) as Record<string, unknown>);
    if (text === undefined) continue;
    const thread = threads.get(event.item_id) ?? [];
    thread.push({ text, by: event.actor_name, at: event.at });
    threads.set(event.item_id, thread);
  }
  const hits = items.flatMap((item) => {
    const fields = Object.values(JSON.parse(item.fields || '{}') as Record<string, unknown>);
    const own = [item.title, ...fields.filter((value) => typeof value === 'string')].map(
      (text): Said => ({ text, by: item.created_by_name, at: item.created_at }),
    );
    const all = [...own, ...(threads.get(item.id) ?? [])];
    const score = wordsHeld(all.map(({ text }) => text).join('\n'), searched);
    if (score === 0) return [];
    // What it said that holds the most words, the latest of those.
    const best = all.reduce((kept, each) =>
      wordsHeld(each.text, searched) >= wordsHeld(kept.text, searched) ? each : kept,
    );
    const hit: ItemHit = {
      id: item.id,
      title: item.title,
      said: short(best.text),
      by: best.by,
      at: best.at,
    };
    return [{ hit, score }];
  });
  return hits
    .sort((a, b) => b.score - a.score || b.hit.at.localeCompare(a.hit.at))
    .slice(0, ITEM_HITS_AT_MOST)
    .map(({ hit }) => hit);
}

// The items found, after the topics: each with what it said, unless that is its title.
export function itemHitsText(hits: readonly ItemHit[]): string {
  if (hits.length === 0) return '';
  const lines = hits.map(({ id, title, said }) =>
    said === title ? `${id}  ${title}` : `${id}  ${title}\n    ${said}`,
  );
  return ["In the items' threads (otea show <id>):", ...lines].join('\n');
}
