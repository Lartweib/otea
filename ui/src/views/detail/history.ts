import {
  NOTE_ANSWERED,
  NOTE_LEFT,
  type NoteEvent,
  notesOf,
} from '../../../../src/core/board/notes.ts';
import {
  legacyAsks,
  QUESTION_ANSWERED,
  QUESTION_ASKED,
} from '../../../../src/core/board/questions.ts';
import { describeEvent, formatTime, momentParts, relayOf } from '../../format.ts';
import { t } from '../../i18n/i18n.ts';
import type { AgentProfile } from '../../presence.ts';
import { fieldWord, valueWord } from '../../preset-words.ts';
import type { ItemEvent, TypeView } from '../../types.ts';

// The item's history as the sheet's lane says it (SPEC §10.3, mock:638-649, 2736-2739): newest
// first, a dot per event (yours blue, agents ink, a ring when an agent relayed your words), the
// words of what happened, any quote, who did it.

// A note to the agent at work is one line (its answer folds into it): a hollow blue dot, yours but
// moving nothing; `open` while it waits for the answer.
export type HistoryLine = {
  id: number;
  dot: 'you' | 'agent' | 'relay' | 'note';
  open?: boolean;
  when: string;
  text: string;
  quote?: string;
  who: string;
  // The profile the agent wrote it with; none on yours, nor on your decision an agent relayed.
  profile?: AgentProfile;
};

const reasonOf = (e: ItemEvent) =>
  typeof e.data.reason === 'string' && e.data.reason !== '' ? e.data.reason : undefined;

export function whenOf(iso: string, now: number): string {
  const { day, time } = momentParts(iso, now);
  if (!day) return `${t('sheet.h.today')} ${time}`;
  const [today = ''] = formatTime(new Date(now).toISOString()).split(' ');
  const [date = ''] = formatTime(iso).split(' ');
  const yesterday = Date.parse(`${today}T00:00:00`) - Date.parse(`${date}T00:00:00`) <= 86_400_000;
  return yesterday ? `${t('sheet.h.yesterday')} ${time}` : `${day} ${time}`;
}

export function historyOf(
  events: readonly ItemEvent[],
  type: TypeView | undefined,
  word: (state: string) => string,
  now: number,
): HistoryLine[] {
  const states = new Map((type?.states ?? []).map((s) => [s.name, s]));
  const fieldWords = {
    field: (key: string) => fieldWord(type, key) ?? key,
    value: (key: string, value: string) => valueWord(type, key, value),
  };
  // A state the type still has reads by its name today; one deleted since, by the name its event
  // kept when it was written (`stateName`, `toName`), else as stored.
  const named = (state: string, kept: unknown) =>
    states.has(state) || typeof kept !== 'string' || kept === '' ? word(state) : kept;
  const sorted = [...events]
    .filter(({ type }) => type !== NOTE_ANSWERED)
    .sort((a, b) => a.id - b.id);
  const notes = new Map(notesOf(events as unknown as NoteEvent[]).map((note) => [note.note, note]));
  let handed = 0;
  // Before Otea read the item onto its board, its states were a preset's: their names are not
  // the board's words, so those lines say what happened without them.
  const reading = sorted.findLastIndex(
    (e) => e.type === 'transitioned' && e.data.reason === 'migrate',
  );
  const before = (i: number, state: unknown) => i < reading && !states.has(String(state));
  const lines = sorted.map((e, i): HistoryLine => {
    const relay = relayOf(e);
    const human = e.actor.kind === 'human';
    const who = human || relay ? t('sheet.d.youLower') : e.actor.name;
    const base = {
      id: e.id,
      when: whenOf(e.at, now),
      who,
      dot: (relay ? 'relay' : human ? 'you' : 'agent') as HistoryLine['dot'],
      ...(!human && !relay && e.profile ? { profile: e.profile } : {}),
    };
    const reason = reasonOf(e);
    if (e.type === NOTE_LEFT) {
      const note = notes.get(Number(e.data.note));
      const said = [
        note?.anchor ? t('notes.h.on', { file: note.anchor.filename }) : null,
        note?.answer
          ? t('notes.h.answered', {
              agent: note.answer.by,
              time: momentParts(note.answer.at, now).time,
            })
          : null,
      ].filter(Boolean);
      return {
        ...base,
        dot: 'note',
        open: !note?.answer,
        text: t('notes.h.left'),
        quote: String(e.data.text ?? ''),
        who: said.join(' · '),
      };
    }
    // An agent's question (otea ask) and your answer: neither moves the item.
    if (e.type === QUESTION_ASKED)
      return { ...base, text: t('sheet.h.askedYou'), quote: String(e.data.text ?? '') };
    if (e.type === QUESTION_ANSWERED)
      return { ...base, text: t('sheet.h.youAnswered'), quote: String(e.data.text ?? '') };
    if (e.type === 'created' && before(i, e.data.state)) {
      return { ...base, text: t(human ? 'sheet.h.createdYouBefore' : 'sheet.h.createdBefore') };
    }
    if (
      e.type === 'transitioned' &&
      !relay &&
      e.data.reason !== 'migrate' &&
      before(i, e.data.to)
    ) {
      const q = reason ? { quote: reason } : {};
      return { ...base, text: t(human ? 'sheet.h.movedYouBefore' : 'sheet.h.movedBefore'), ...q };
    }
    if (e.type === 'created') {
      const state = named(String(e.data.state), e.data.stateName);
      return { ...base, text: t(human ? 'sheet.h.createdYou' : 'sheet.h.created', { state }) };
    }
    if (e.type === 'transitioned') {
      const to = String(e.data.to);
      const state = named(to, e.data.toName);
      const target = states.get(to);
      // Otea reading a preset's item onto its board: no one moved it, and "migrate" is a marker.
      if (e.data.reason === 'migrate') {
        const note = typeof e.data.note === 'string' && e.data.note.trim() ? e.data.note : null;
        return {
          ...base,
          who: 'Otea',
          dot: 'agent',
          text: t('sheet.h.migrated', { state }),
          ...(note ? { quote: note } : {}),
        };
      }
      // A publish, or its undo, placing the item: the board moved it, and its reason is a marker.
      if (e.data.reason === 'publish')
        return {
          ...base,
          text: t('sheet.h.published', { version: String(e.data.board_version ?? ''), state }),
        };
      if (e.data.reason === 'restore') return { ...base, text: t('sheet.h.restored', { state }) };
      if (relay) {
        return {
          ...base,
          text: t('sheet.h.relayed', { via: relay.via, state }),
          ...(relay.quote ? { quote: relay.quote } : {}),
        };
      }
      const q = reason ? { quote: reason } : {};
      if (!human) {
        if (target?.turn === 'human') {
          handed += 1;
          const asked = legacyAsks(reason);
          const key = asked
            ? 'sheet.h.asked'
            : handed > 1
              ? 'sheet.h.handedAgain'
              : 'sheet.h.handed';
          return { ...base, text: t(key, { state }), ...q };
        }
        return { ...base, text: t('sheet.h.moved', { state }), ...q };
      }
      if (target?.closes === 'discarded')
        return { ...base, text: t('sheet.h.discarded', { state }), ...q };
      if (target?.turn === 'none') return { ...base, text: t('sheet.h.closed', { state }), ...q };
      if (target?.turn === 'agent' && reason)
        return { ...base, text: t('sheet.h.sentBack', { state }), ...q };
      if (target?.turn === 'agent') return { ...base, text: t('sheet.h.approved', { state }) };
      return { ...base, text: t('sheet.h.youMoved', { state }), ...q };
    }
    if (e.type === 'claimed') {
      const previous = e.data.previous;
      return {
        ...base,
        text:
          typeof previous === 'string'
            ? t('sheet.h.claimedOver', { previous })
            : t('sheet.h.claimed'),
      };
    }
    if (e.type === 'released') {
      if (human && e.data.cause === 'restart') return { ...base, text: t('sheet.h.restarted') };
      if (human && e.data.cause === 'reassign')
        return { ...base, text: t('sheet.h.reassigned', { agent: String(e.data.next) }) };
      return { ...base, text: t('sheet.h.released') };
    }
    if (e.type === 'evidence_added') {
      const caption = typeof e.data.caption === 'string' ? { quote: e.data.caption } : {};
      return {
        ...base,
        text: t('sheet.h.attached', { file: String(e.data.filename) }),
        ...caption,
      };
    }
    return { ...base, text: describeEvent(e, fieldWords) };
  });
  return withProfileChanges(sorted, lines).reverse();
}

// An agent that acts on the item with another profile than its last one here gets a line of its
// own just before that action: "Switched to sonnet · medium" (the harness too when that changed).
// Its first profile on the item says nothing; each agent is compared only with itself. The line's
// id sits between its event's and the one before, so it stays unique and in order.
function withProfileChanges(sorted: readonly ItemEvent[], lines: HistoryLine[]): HistoryLine[] {
  const last = new Map<string, AgentProfile>();
  return sorted.flatMap((e, i) => {
    const line = lines[i] as HistoryLine;
    if (e.actor.kind !== 'agent' || !e.profile) return [line];
    const before = last.get(e.actor.name);
    last.set(e.actor.name, e.profile);
    if (!before || sameProfile(before, e.profile)) return [line];
    const words = [e.profile.model, e.profile.effort];
    if (before.harness !== e.profile.harness && e.profile.harness) words.unshift(e.profile.harness);
    const change: HistoryLine = {
      id: e.id - 0.5,
      dot: 'agent',
      when: line.when,
      text: t('sheet.h.profileChanged', { profile: words.join(' · ') }),
      who: e.actor.name,
      profile: e.profile,
    };
    return [change, line];
  });
}

const sameProfile = (a: AgentProfile, b: AgentProfile) =>
  a.harness === b.harness && a.model === b.model && a.effort === b.effort;
