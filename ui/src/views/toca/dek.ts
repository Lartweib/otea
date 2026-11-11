import { isStuck } from '../../derive/toca.ts';
import { t } from '../../i18n/i18n.ts';
import type { Item } from '../../types.ts';
import { numberWord, sinceText, spanText } from './words.ts';

// The dek under Te toca's and Atasco's display (mock:1464-1476): how many things wait for you and
// since when the oldest, what the agents handed over today; in Atasco, who went quiet and since when.

const MARK = '\u0000';

// When a waiting item started waiting: when it came to you, or when its agent's lease ran out.
const waitingSince = (it: Item, now: number): number | null =>
  it.turn === 'human'
    ? Date.parse(it.updatedAt)
    : isStuck(it, now) && it.expiredLease
      ? Date.parse(it.expiredLease.expiresAt)
      : null;

export function oldestWaiting(items: readonly Item[], now: number): number {
  let oldest = 0;
  for (const it of items) {
    const at = waitingSince(it, now);
    if (at !== null) oldest = Math.max(oldest, now - at);
  }
  return oldest;
}

export type TocaDek = { lead: string; handed: { before: string; n: string; after: string } };

export function tocaDek(items: readonly Item[], handed: number, now: number): TocaDek {
  const waiting = items.filter((it) => waitingSince(it, now) !== null).length;
  const lead = waiting
    ? t('toca.dek.waiting', {
        count: waiting,
        n: numberWord(waiting, true),
        since: sinceText(oldestWaiting(items, now)),
      })
    : t('toca.dek.none');
  if (!handed) return { lead, handed: { before: t('toca.dek.handedNone'), n: '', after: '' } };
  const [before = '', after = ''] = t('toca.dek.handed', { n: MARK }).split(MARK);
  return { lead, handed: { before, n: numberWord(handed), after } };
}

export type Quiet = { agent: string; since: number };

// The agents whose lease ran out with nobody taking the item again, longest quiet first.
export function quietOnes(items: readonly Item[], now: number): Quiet[] {
  return items
    .filter((it) => isStuck(it, now) && it.expiredLease)
    .map((it) => ({
      agent: it.expiredLease?.holder ?? '',
      since: now - Date.parse(it.expiredLease?.expiresAt ?? ''),
    }))
    .sort((a, b) => b.since - a.since);
}

export type AtascoDek = { lead: string; quiet: { agent: string; text: string }[] };

export function atascoDek(items: readonly Item[], now: number): AtascoDek {
  const quiet = quietOnes(items, now);
  if (!quiet.length) return { lead: t('toca.dekStuck.none'), quiet: [] };
  return {
    lead: t('toca.dekStuck.lead', { count: quiet.length, n: numberWord(quiet.length, true) }),
    quiet: quiet.map((q) => ({
      agent: q.agent,
      text: t('toca.dekStuck.agent', { agent: MARK, time: spanText(q.since) }).split(MARK)[1] ?? '',
    })),
  };
}
