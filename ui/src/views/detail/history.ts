import { describeEvent, formatTime, momentParts, relayOf } from '../../format.ts';
import { t } from '../../i18n/i18n.ts';
import type { ItemEvent, TypeView } from '../../types.ts';

// The item's history as the sheet's lane says it (SPEC §10.3, mock:638-649, 2736-2739): newest
// first, a dot per event (yours blue, agents ink, a ring when an agent relayed your words), the
// words of what happened, any quote, who did it.

export type HistoryLine = {
  id: number;
  dot: 'you' | 'agent' | 'relay';
  when: string;
  text: string;
  quote?: string;
  who: string;
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
  const sorted = [...events].sort((a, b) => a.id - b.id);
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
    };
    const reason = reasonOf(e);
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
      const state = word(String(e.data.state));
      return { ...base, text: t(human ? 'sheet.h.createdYou' : 'sheet.h.created', { state }) };
    }
    if (e.type === 'transitioned') {
      const to = String(e.data.to);
      const state = word(to);
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
          const asked = reason?.trim().endsWith('?');
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
    return { ...base, text: describeEvent(e) };
  });
  return lines.reverse();
}
