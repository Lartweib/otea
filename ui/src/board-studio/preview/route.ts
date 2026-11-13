import type { Phase } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  DONE,
  type Doer,
  type Reviewer,
} from '../../../../src/core/board/model.ts';
import type { Lane } from '../../lanes/geometry.ts';
import type { DipSpec, RouteStep } from '../../views/detail/route.ts';

// The item's route drawn from the board definition, for the item page's Route: each step a stop on
// the lane of whoever does it, a review by the other side a visit to that lane (a point, not a
// stop: it has no name), and Hecho on the trunk. Send-backs dip at the review they came from.

export type RouteAt = { step: string; phase: Phase } | typeof DONE;

export type DefinitionRoute = {
  steps: RouteStep[];
  words: string[];
  ci: number;
  lane: Lane;
  dips: DipSpec[];
};

// dip: the label of a send-back, its round and, when known, when it happened.
export type RouteWords = { done: string; dip: (round: number, at?: string) => string };

const laneOfWho = (who: Doer | Reviewer): Lane => (who === 'you' ? 'you' : 'ag');

const visitOf = (stepId: string) => `${stepId}:review`;

export function definitionRoute(
  def: BoardDefinition,
  at: RouteAt,
  dips: readonly { from: string; at?: string }[],
  words: RouteWords,
): DefinitionRoute {
  const steps: RouteStep[] = [];
  const shown: string[] = [];
  for (const step of def.steps) {
    const lane = laneOfWho(step.doer);
    steps.push({ name: step.id, lane });
    shown.push(step.name);
    if (step.reviewer !== 'none' && laneOfWho(step.reviewer) !== lane) {
      steps.push({ name: visitOf(step.id), lane: laneOfWho(step.reviewer) });
      shown.push('');
    }
  }
  steps.push({ name: DONE, lane: 'none' });
  shown.push(words.done);

  const index = (name: string) => steps.findIndex((stop) => stop.name === name);
  // Where the review of a step sits: its visit, or the step itself when it has none.
  const reviewAt = (stepId: string) => {
    const visit = index(visitOf(stepId));
    return visit >= 0 ? visit : index(stepId);
  };

  let ci = steps.length - 1;
  let lane: Lane = 'none';
  if (at !== DONE) {
    const step = def.steps.find(({ id }) => id === at.step);
    if (step) {
      ci = at.phase === 'doing' ? index(step.id) : reviewAt(step.id);
      lane = at.phase === 'doing' ? laneOfWho(step.doer) : laneOfWho(step.reviewer);
    }
  }

  const sent = new Map<string, number>();
  const dipped: DipSpec[] = [];
  for (const { from, at: when } of dips) {
    const at = reviewAt(from);
    if (at < 0) continue;
    const n = (sent.get(from) ?? 0) + 1;
    sent.set(from, n);
    dipped.push({ at, label: words.dip(n, when) });
  }
  return { steps, words: shown, ci, lane, dips: dipped };
}
