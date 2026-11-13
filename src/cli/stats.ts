import type { PerformanceView } from '../app/performance.ts';
import type { Numbers } from '../core/board/performance.ts';
import { columns } from './format.ts';

// otea stats as text: one row per model family and effort, its exact models and its board steps
// under it, indented, with the same numbers --json gives.

const HEAD = [
  'model · effort',
  'handoffs',
  'sent back',
  'rounds per step',
  'items done',
  'discards',
  'claim to handoff',
];

const NONE = '–';

// A span of time, roughly: minutes under two hours, then hours under two days, then days.
export function spanText(ms: number | null): string {
  if (ms === null) return NONE;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '<1 min';
  if (minutes < 120) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function cells(label: string, n: Numbers): string[] {
  const rate = n.handoffs === 0 ? 0 : Math.round((n.sentBack / n.handoffs) * 100);
  return [
    label,
    String(n.handoffs),
    n.handoffs === 0 ? NONE : `${n.sentBack} (${rate}%)`,
    n.finishedSteps === 0 ? NONE : (n.rounds / n.finishedSteps).toFixed(1),
    String(n.itemsFinished),
    String(n.discards),
    spanText(n.medianClaimToHandoffMs),
  ];
}

export function statsText(view: PerformanceView, period: string): string {
  const when = period === 'all' ? 'all time' : `last ${period}`;
  const where = view.boards.length === 1 ? `board ${view.boards[0]}` : 'every board';
  const title = `How each model performs, ${when}, ${where} (profiles as the agents declare them)`;
  if (view.rows.length === 0) {
    return `${title}\n\nNo handoffs yet by an agent with a declared profile.`;
  }
  const rows = view.rows.flatMap((row) => [
    cells(`${row.family} · ${row.effort}`, row),
    ...(row.models.length > 1 || row.models[0]?.model !== row.family
      ? row.models.map((model) => cells(`  ${model.model}`, model))
      : []),
    ...row.steps.map((step) => cells(`  ${step.board} › ${step.stepName}`, step)),
  ]);
  return `${title}\n\n${columns([HEAD, ...rows])}`;
}
