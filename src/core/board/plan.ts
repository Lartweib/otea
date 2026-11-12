import { isClosed, positionOf, stateOf } from './engine.ts';
import {
  type BoardDefinition,
  type Cap,
  DONE,
  type Doer,
  isAgent,
  isEvidence,
  partOf,
  type Requirement,
  type Reviewer,
  SAME,
  stepById,
  type Target,
  usedRefs,
} from './model.ts';

// What publishing a draft changes, for the Publicar dialog: the changes in order (the UI words each
// kind), the items that need a choice (a removed step's items) and the effects on items in flight.
// The server applies the same functions in the publish transaction, so the dialog never promises
// what publishing does not do.

export type Change =
  | { kind: 'created'; board: string; steps: string[] }
  | { kind: 'board_renamed'; from: string; to: string }
  | { kind: 'item_renamed'; to: string }
  | { kind: 'step_added'; step: string; name: string; doer: Doer; reviewer: Reviewer }
  | { kind: 'step_renamed'; step: string; from: string; to: string }
  | { kind: 'step_doer'; step: string; name: string; doer: Doer }
  | { kind: 'step_reviewer'; step: string; name: string; reviewer: Reviewer }
  | {
      kind: 'hand_added' | 'hand_changed';
      step: string;
      name: string;
      part: string;
      partName: string;
      req: Requirement;
      fresh: boolean;
    }
  | { kind: 'hand_removed'; step: string; name: string; part: string; partName: string }
  | { kind: 'step_instructions' | 'step_ways'; step: string; name: string }
  // `to`: the name of the step a send-back now lands on (the step itself for the same one).
  | { kind: 'step_back'; step: string; name: string; to: string }
  | { kind: 'step_removed'; step: string; name: string }
  | { kind: 'steps_reordered' }
  | { kind: 'part_renamed'; part: string; from: string; to: string }
  | { kind: 'part_added'; part: string; name: string; evidence: boolean }
  | { kind: 'form'; names: string[] }
  | { kind: 'layout' }
  | { kind: 'board_instructions' }
  | { kind: 'cap'; cap: Cap };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const whoKey = (who: Doer | Reviewer) => (isAgent(who) ? `agent:${who.agent}` : who);

export function changePlan(live: BoardDefinition | null, draft: BoardDefinition): Change[] {
  if (!live) return [{ kind: 'created', board: draft.name, steps: draft.steps.map((s) => s.name) }];
  const out: Change[] = [];
  if (live.name !== draft.name)
    out.push({ kind: 'board_renamed', from: live.name, to: draft.name });
  if (live.item !== draft.item) out.push({ kind: 'item_renamed', to: draft.item });
  for (const step of draft.steps) {
    const old = live.steps.find(({ id }) => id === step.id);
    const { id, name } = step;
    if (!old) {
      out.push({ kind: 'step_added', step: id, name, doer: step.doer, reviewer: step.reviewer });
      continue;
    }
    if (old.name !== name) out.push({ kind: 'step_renamed', step: id, from: old.name, to: name });
    if (whoKey(old.doer) !== whoKey(step.doer))
      out.push({ kind: 'step_doer', step: id, name, doer: step.doer });
    if (whoKey(old.reviewer) !== whoKey(step.reviewer))
      out.push({ kind: 'step_reviewer', step: id, name, reviewer: step.reviewer });
    for (const hand of step.hand) {
      const part = partOf(draft, hand.ref);
      if (!part) continue;
      const before = old.hand.find(({ ref }) => ref === hand.ref);
      const base = { step: id, name, part: part.id, partName: part.name };
      if (!before) out.push({ kind: 'hand_added', ...base, req: hand.req, fresh: hand.fresh });
      else if (
        before.req !== hand.req ||
        before.fresh !== hand.fresh ||
        !same(before.when, hand.when)
      )
        out.push({ kind: 'hand_changed', ...base, req: hand.req, fresh: hand.fresh });
    }
    for (const before of old.hand) {
      if (step.hand.some(({ ref }) => ref === before.ref)) continue;
      const partName = partOf(live, before.ref)?.name ?? '';
      out.push({ kind: 'hand_removed', step: id, name, part: before.ref, partName });
    }
    if (!same(old.instructions, step.instructions))
      out.push({ kind: 'step_instructions', step: id, name });
    if (!same(old.ways, step.ways)) out.push({ kind: 'step_ways', step: id, name });
    if (old.back !== step.back) {
      const to = step.back === SAME ? name : (stepById(draft, step.back)?.name ?? name);
      out.push({ kind: 'step_back', step: id, name, to });
    }
  }
  for (const old of live.steps) {
    if (!draft.steps.some(({ id }) => id === old.id))
      out.push({ kind: 'step_removed', step: old.id, name: old.name });
  }
  const kept = (from: BoardDefinition, other: BoardDefinition) =>
    from.steps.filter(({ id }) => other.steps.some((s) => s.id === id)).map(({ id }) => id);
  if (!same(kept(live, draft), kept(draft, live))) out.push({ kind: 'steps_reordered' });

  const used = usedRefs(draft);
  const handed = new Set(draft.steps.flatMap(({ hand }) => hand.map(({ ref }) => ref)));
  for (const part of Object.values(draft.parts)) {
    if (!used.has(part.id)) continue;
    const old = live.parts[part.id];
    if (old && old.name !== part.name)
      out.push({ kind: 'part_renamed', part: part.id, from: old.name, to: part.name });
    if (!old && !handed.has(part.id))
      out.push({ kind: 'part_added', part: part.id, name: part.name, evidence: isEvidence(part) });
  }
  if (!same(live.form, draft.form) || live.title !== draft.title) {
    const names = [draft.title, ...draft.form.map(({ ref }) => partOf(draft, ref)?.name ?? '')];
    out.push({ kind: 'form', names: names.filter(Boolean) });
  }
  if (!same(live.layout, draft.layout) || !same(live.row, draft.row)) out.push({ kind: 'layout' });
  if (live.about !== draft.about || live.idle !== draft.idle)
    out.push({ kind: 'board_instructions' });
  if (!same(live.cap, draft.cap)) out.push({ kind: 'cap', cap: draft.cap });
  return out;
}

export type ItemState = { id: string; state: string };

export type ItemEffects = {
  // Items in steps the draft removes: where they go needs a choice; `suggested` is the next step
  // that stays, or Hecho.
  moves: { step: string; name: string; items: string[]; suggested: Target }[];
  // Items being worked on in a step whose handoff now requires more.
  needs: { step: string; name: string; items: string[]; parts: string[] }[];
  // Items waiting in a review the draft no longer has: they go back to work in the same step.
  reopened: { step: string; name: string; items: string[] }[];
};

function suggestion(live: BoardDefinition, draft: BoardDefinition, stepId: string): Target {
  const index = live.steps.findIndex(({ id }) => id === stepId);
  const next = live.steps.slice(index + 1).find(({ id }) => draft.steps.some((s) => s.id === id));
  return next?.id ?? DONE;
}

// Whether the draft still has the phase an open item stands in.
function phaseSurvives(draft: BoardDefinition, stepId: string, phase: string): boolean {
  const step = draft.steps.find(({ id }) => id === stepId);
  if (!step) return false;
  if (phase === 'review') return step.reviewer !== 'none';
  if (phase === 'yours') return isAgent(step.reviewer);
  return true;
}

export function itemEffects(
  live: BoardDefinition,
  draft: BoardDefinition,
  items: readonly ItemState[],
): ItemEffects {
  const out: ItemEffects = { moves: [], needs: [], reopened: [] };
  const open = items
    .map((item) => ({ ...item, at: positionOf(item.state) }))
    .flatMap(({ id, at }) => (isClosed(at) ? [] : [{ id, step: at.step, phase: at.phase }]));
  for (const old of live.steps) {
    const here = open.filter(({ step }) => step === old.id);
    const step = draft.steps.find(({ id }) => id === old.id);
    if (!step) {
      if (here.length > 0)
        out.moves.push({
          step: old.id,
          name: old.name,
          items: here.map(({ id }) => id),
          suggested: suggestion(live, draft, old.id),
        });
      continue;
    }
    const doing = here.filter(({ phase }) => phase === 'doing').map(({ id }) => id);
    const required = (list: typeof step.hand) =>
      new Set(list.filter(({ req }) => req === 'always').map(({ ref }) => ref));
    const before = required(old.hand);
    const added = [...required(step.hand)].filter((ref) => !before.has(ref));
    if (doing.length > 0 && added.length > 0)
      out.needs.push({
        step: step.id,
        name: step.name,
        items: doing,
        parts: added.map((ref) => partOf(draft, ref)?.name ?? ''),
      });
    const lost = here.filter(({ phase }) => !phaseSurvives(draft, step.id, phase));
    if (lost.length > 0)
      out.reopened.push({ step: step.id, name: step.name, items: lost.map(({ id }) => id) });
  }
  return out;
}

export type ItemMove = { id: string; from: string; to: string };

// The state changes publishing makes to open items: those of removed steps go where `moves` says
// (or to the suggestion), and reviews the draft no longer has go back to work in their step.
export function itemMoves(
  live: BoardDefinition,
  draft: BoardDefinition,
  items: readonly ItemState[],
  moves: Readonly<Record<string, Target>>,
): { ok: true; moves: ItemMove[] } | { ok: false; step: string } {
  const out: ItemMove[] = [];
  for (const item of items) {
    const at = positionOf(item.state);
    if (isClosed(at)) continue;
    const kept = draft.steps.some(({ id }) => id === at.step);
    if (!kept) {
      if (!live.steps.some(({ id }) => id === at.step)) continue;
      const target = moves[at.step] ?? suggestion(live, draft, at.step);
      if (target !== DONE && !draft.steps.some(({ id }) => id === target))
        return { ok: false, step: at.step };
      const to = target === DONE ? DONE : stateOf({ step: target, phase: 'doing' });
      out.push({ id: item.id, from: item.state, to });
      continue;
    }
    if (!phaseSurvives(draft, at.step, at.phase))
      out.push({ id: item.id, from: item.state, to: stateOf({ step: at.step, phase: 'doing' }) });
  }
  return { ok: true, moves: out };
}
