import { t } from '../../i18n/i18n.ts';

// How Te toca says numbers and times in prose (mock:1018-1019): counts as words up to thirteen,
// spans the way a person says them.

const MIN = 60_000;

export function numberWord(n: number, capital = false): string {
  const w = t('toca.numbers').split('|')[n] ?? String(n);
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

// A span of time: 12 min, 2 h, 3 días.
export function spanText(ms: number): string {
  const m = Math.max(0, ms) / MIN;
  if (m < 60) return t('when.minutes', { minutes: Math.max(1, Math.floor(m)) });
  if (m < 1440) return t('when.hours', { hours: Math.round(m / 60) });
  return t('when.days', { count: Math.round(m / 1440) });
}

// Since when: desde hace 14 min, desde hace 2 h, desde ayer, desde hace 3 días.
export function sinceText(ms: number): string {
  const m = Math.max(0, ms) / MIN;
  if (m < 1) return t('toca.since.now');
  if (m < 60) return t('toca.since.minutes', { minutes: Math.floor(m) });
  if (m < 1440) return t('toca.since.hours', { hours: Math.round(m / 60) });
  if (m < 2880) return t('toca.since.yesterday');
  return t('toca.since.days', { count: Math.round(m / 1440) });
}
