import { ageLabel, momentLabel, spanLabel } from './format.ts';
import { t } from './i18n/i18n.ts';
import type { Item, Lease } from './types.ts';

// Same rule as the server: a lease stops counting the moment it expires, even if no write follows.
export function activeLease(lease: Lease | null, now: number): Lease | null {
  return lease && Date.parse(lease.expiresAt) > now ? lease : null;
}

const MINUTE = 60_000;
// A unit of the time left, in minutes, from the largest: 2d, 3h, 12m.
const UNITS = [
  { minutes: 1440, suffix: 'd' },
  { minutes: 60, suffix: 'h' },
  { minutes: 1, suffix: 'm' },
] as const;

type Left = { count: number; unit: number; suffix: 'd' | 'h' | 'm' };

// The time left on a lease in whole units: minutes rounded up (so it never says 0m), then hours
// and days rounded down; `count` units of `unit` minutes. Undefined once it has run out.
function left(lease: Lease, now: number): Left | undefined {
  const minutes = Math.ceil((Date.parse(lease.expiresAt) - now) / MINUTE);
  if (!(minutes > 0)) return undefined;
  const { minutes: unit, suffix } = UNITS.find((each) => minutes >= each.minutes) ?? UNITS[2];
  return { count: Math.floor(minutes / unit), unit, suffix };
}

// How long an agent still holds an item, as the time column says it: 12m left, 2h left, expired.
export function leaseLeft(lease: Lease, now: number): string {
  const time = left(lease, now);
  return time ? leftLabel(time) : t('lease.expired');
}

const leftLabel = ({ count, suffix }: Left) => t('lease.left', { time: spanLabel(suffix, count) });

// The widest the time column says a lease, in characters of the language on screen (`59m left`,
// `quedan 59 min`): the list and the grid size that column by it.
export function leaseChars(): number {
  const said = [
    leftLabel({ count: 59, unit: 1, suffix: 'm' }),
    leftLabel({ count: 23, unit: 60, suffix: 'h' }),
    t('lease.expired'),
  ];
  return Math.max(...said.map((text) => text.length));
}

export type TimeCell =
  | { tone: 'age'; text: string }
  | { tone: 'left'; text: string; label: string; changesAt: number }
  | { tone: 'expired'; text: string; label: string };

// What the time column of a list row or a grid shows: the time left on the lease while an agent holds
// the item, `expired` for a lease that ran out without a release (while shown, or served apart as
// expiredLease), otherwise the age. A lease names its holder and the moment it ends in its label,
// and says when its text next changes.
export function timeCell(
  item: Pick<Item, 'updatedAt' | 'lease' | 'expiredLease'>,
  now: number,
  timeZone?: string,
): TimeCell {
  const lease = item.lease ?? item.expiredLease;
  if (!lease) return { tone: 'age', text: ageLabel(item.updatedAt, now) };
  const ends = momentLabel(lease.expiresAt, now, timeZone);
  const time = left(lease, now);
  if (!time) {
    return {
      tone: 'expired',
      text: t('lease.expired'),
      label: t('lease.heldExpired', { holder: lease.holder, time: ends }),
    };
  }
  // The text changes once the minutes left drop under the count it shows.
  const changesAt = Date.parse(lease.expiresAt) - (time.count * time.unit - 1) * MINUTE;
  return {
    tone: 'left',
    text: leftLabel(time),
    label: t('lease.heldUntil', { holder: lease.holder, time: ends }),
    changesAt,
  };
}
