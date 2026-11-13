import type { Numbers, PerformanceRow } from '../../src/core/board/performance.ts';
import { language, t } from './i18n/i18n.ts';

// Rendimiento's words and figures, worked out from the server's numbers alone
// (src/core/board/performance.ts): the one plain reading at the top, and each figure of the table.

// Fewer handoffs than this say too little about a model to read a sentence from them.
export const MIN_HANDOFFS = 5;

export const NONE = '–';

export const rateOf = ({ handoffs, sentBack }: Numbers) =>
  handoffs === 0 ? 0 : sentBack / handoffs;

export const labelOf = ({ family, effort }: PerformanceRow) => `${family} · ${effort}`;

// How often a row's handoffs come back, as "1 in N" (or none, or nearly all).
function comesBack(row: PerformanceRow, first: boolean): string {
  const rate = rateOf(row);
  if (rate === 0) return t('perf.reading.none');
  const every = Math.round(1 / rate);
  if (every <= 1) return t('perf.reading.nearlyAll');
  return t(first ? 'perf.reading.oneIn' : 'perf.reading.oneInShort', { n: every });
}

// The sentence at the top: the rows with enough handoffs, the one whose handoffs come back most
// beside the one they come back least; null while no row has enough.
export function readingOf(rows: readonly PerformanceRow[]): string | null {
  const enough = rows.filter(({ handoffs }) => handoffs >= MIN_HANDOFFS);
  if (enough.length === 0) return null;
  const sorted = [...enough].sort((a, b) => rateOf(b) - rateOf(a));
  const worst = sorted[0] as PerformanceRow;
  const best = sorted.at(-1) as PerformanceRow;
  const first = comesBack(worst, true);
  if (sorted.length === 1 || rateOf(worst) === rateOf(best)) {
    return t('perf.reading.one', { model: labelOf(worst), back: first });
  }
  return t('perf.reading.two', {
    model: labelOf(worst),
    back: first,
    other: labelOf(best),
    otherBack: comesBack(best, false),
  });
}

// A span of time, roughly: minutes under two hours, then hours under two days, then days.
export function spanText(ms: number | null): string {
  if (ms === null) return NONE;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return t('perf.underMinute');
  if (minutes < 120) return t('when.minutes', { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return t('when.hours', { hours });
  return t('when.days', { count: Math.round(hours / 24) });
}

// Rounds per finished step, with one decimal in the language on screen.
export function roundsText({ finishedSteps, rounds }: Numbers): string {
  if (finishedSteps === 0) return NONE;
  const format = new Intl.NumberFormat(language(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return format.format(rounds / finishedSteps);
}

export function percentText(numbers: Numbers): string {
  if (numbers.handoffs === 0) return NONE;
  return new Intl.NumberFormat(language(), { style: 'percent' }).format(rateOf(numbers));
}
