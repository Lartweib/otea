import { activeLease } from '../active-lease.ts';
import { t } from '../i18n/i18n.ts';
import type { Item } from '../types.ts';

const MIN = 60_000;

// A span of minutes as a row writes it: 1 h 42, 2 h (the minutes go under ten), 9 min.
function span(m: number): string {
  if (m < 60) return t('when.minutes', { minutes: m });
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  return minutes >= 10 ? t('when.hoursMinutes', { hours, minutes }) : t('when.hours', { hours });
}

// How long ago, rounded the way a person says it: now, 12 min, 3 h, yesterday, 3 days.
function age(minutes: number): string {
  if (minutes < 1) return t('when.now');
  if (minutes < 60) return t('when.minutes', { minutes: Math.floor(minutes) });
  if (minutes < 1440) return t('when.hours', { hours: Math.round(minutes / 60) });
  if (minutes < 2880) return t('when.yesterday');
  return t('when.days', { count: Math.round(minutes / 1440) });
}

// How long a live lease has left, «quedan 18 min»; null when it ran out.
export function leaseLeftText(lease: Item['lease'], now: number): string | null {
  const live = activeLease(lease, now);
  if (!live) return null;
  const left = Math.max(1, Math.ceil((Date.parse(live.expiresAt) - now) / MIN));
  return t('when.left', { time: span(left) });
}

// When the item's turn began (P1-6): an agent's question since it was asked, else since the item
// entered its state, never its last change (a note or a field edit is no new turn).
export function turnSince(item: Pick<Item, 'asks' | 'enteredAt' | 'updatedAt'>): number {
  return Date.parse(item.asks?.at ?? item.enteredAt ?? item.updatedAt);
}

// When, as a row's age column says it (mock:1315-1325): the time left on the lease of an agent at
// work, "expired" in warn when its lease ran out, else how long the item has been where it is.
export function whenText(item: Item, now: number): { text: string; warn: boolean } {
  if (item.turn === 'agent') {
    const lease = activeLease(item.lease, now);
    if (lease) {
      const left = Math.max(1, Math.ceil((Date.parse(lease.expiresAt) - now) / MIN));
      return { text: t('when.left', { time: span(left) }), warn: false };
    }
    if (item.expiredLease) return { text: t('when.expired'), warn: true };
  }
  return { text: age((now - turnSince(item)) / MIN), warn: false };
}

// How long ago something happened, as a sentence says it: «hace 12 min», and «ahora» or «ayer»
// alone (never «hace ahora», IDEA3-4).
export function agoText(at: string, now: number): string {
  const minutes = (now - Date.parse(at)) / MIN;
  const said = age(minutes);
  if (minutes < 1 || (minutes >= 1440 && minutes < 2880)) return said;
  return t('sheet.ago', { time: said });
}
