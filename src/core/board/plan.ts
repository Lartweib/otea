import { backWaysOf, isClosed, positionOf, stateOf } from './engine.ts';
import {
  type BoardDefinition,
  type Cap,
  DONE,
  type Doer,
  DROPPED,
  type Drop,
  defaultWay,
  guardedBranch,
  isEvidence,
  type ListView,
  MOTIVE,
  type PartKind,
  partOf,
  type Requirement,
  type Reviewer,
  SAME,
  STEP,
  stepById,
  stepIndex,
  type Target,
  usedRefs,
  type Wait,
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
  | { kind: 'cap'; cap: Cap }
  // The first step is skipped (or no longer) for items created with everything: `to` is where
  // they start then.
  | { kind: 'skip'; step: string; name: string; to: string; on: boolean }
  // The doer may (or no longer) take the item back to `to` (`you`: the person's own step, Devolver).
  | { kind: 'way_back'; step: string; name: string; to: string; you: boolean; on: boolean }
  | { kind: 'note'; step: string; name: string; on: boolean }
  // `board`: the name of the board the parts are on, when it waits for them.
  | { kind: 'waits'; step: string; name: string; waits: Wait[]; board?: string }
  | { kind: 'doer_drop'; step: string; name: string; on: boolean }
  // The protected branch: the names of the steps it is pushed in; `push: null` when unprotected.
  | { kind: 'guard'; part: string; partName: string; push: string[] | null; base?: string }
  // A start value: the raw value (a level key, yes or no, a choice id) and, for a choice, its name.
  | {
      kind: 'initial';
      part: string;
      partName: string;
      partKind: PartKind;
      value: string | null;
      valueName?: string;
    }
  // What each item divides into: a board's name (this board's own for parts of the same kind), or
  // null when it divides into nothing.
  | { kind: 'split'; board: string | null; always: boolean }
  | { kind: 'motives'; names: string[] }
  | { kind: 'drop_by'; by: Drop['by'] }
  // `group`: a field's name, STEP or MOTIVE.
  | { kind: 'list'; as: ListView['as']; group?: string };

// How changePlan names the other boards a split leads to.
export type PlanContext = { boardName?: (id: string) => string | undefined };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function changePlan(
  live: BoardDefinition | null,
  draft: BoardDefinition,
  context: PlanContext = {},
): Change[] {
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
    if (old.doer !== step.doer) out.push({ kind: 'step_doer', step: id, name, doer: step.doer });
    if (old.reviewer !== step.reviewer)
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
    if (!same(forward(live, old.id), forward(draft, step.id)))
      out.push({ kind: 'step_ways', step: id, name });
    if (old.back !== step.back) {
      const to = step.back === SAME ? name : (stepById(draft, step.back)?.name ?? name);
      out.push({ kind: 'step_back', step: id, name, to });
    }
  }
  for (const step of draft.steps) {
    if (stepById(live, step.id)) out.push(...laterStepChanges(live, draft, step.id, context));
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
  out.push(...laterBoardChanges(live, draft, context));
  return out;
}

function laterBoardChanges(
  live: BoardDefinition,
  draft: BoardDefinition,
  context: PlanContext,
): Change[] {
  const out: Change[] = [];
  const used = usedRefs(draft);
  for (const part of Object.values(draft.parts)) {
    if (!used.has(part.id)) continue;
    const old = live.parts[part.id];
    const pushNames = (def: BoardDefinition, guard: typeof part.guard) =>
      guard ? guard.push.flatMap((s) => stepById(def, s)?.name ?? []) : null;
    const [was, now] = [pushNames(live, old?.guard), pushNames(draft, part.guard)];
    const moved = (key: 'repo' | 'base') => !same(old?.guard?.[key], part.guard?.[key]);
    if (!same(was, now) || moved('repo') || moved('base'))
      out.push({
        kind: 'guard',
        part: part.id,
        partName: part.name,
        push: now,
        ...(part.guard?.base === undefined ? {} : { base: part.guard.base }),
      });
    if ((old?.initial ?? null) !== (part.initial ?? null)) {
      const choice = part.options.find(({ id }) => id === part.initial);
      out.push({
        kind: 'initial',
        part: part.id,
        partName: part.name,
        partKind: part.kind,
        value: part.initial ?? null,
        ...(choice ? { valueName: choice.name } : {}),
      });
    }
  }
  if (!same(live.split, draft.split))
    out.push({
      kind: 'split',
      board: splitName(draft, context),
      always: draft.split?.always ?? false,
    });
  const motiveNames = (def: BoardDefinition) => def.drop.motives.map(({ name }) => name);
  if (!same(motiveNames(live), motiveNames(draft)))
    out.push({ kind: 'motives', names: motiveNames(draft) });
  if (live.drop.by !== draft.drop.by) out.push({ kind: 'drop_by', by: draft.drop.by });
  if (!same(live.list, draft.list)) {
    const group = draft.list.group;
    const named =
      group === undefined || group === STEP || group === MOTIVE
        ? group
        : (partOf(draft, group)?.name ?? group);
    out.push({ kind: 'list', as: draft.list.as, ...(named === undefined ? {} : { group: named }) });
  }
  return out;
}

// The forward alternatives of a step, which step_ways reports (ways back are their own change).
function forward(def: BoardDefinition, stepId: string): string[] {
  const index = stepIndex(def, stepId);
  return (stepById(def, stepId)?.ways ?? []).filter(
    (way) => way === DONE || stepIndex(def, way) > index,
  );
}

// The name of the board a definition's items divide into, or null.
function splitName(def: BoardDefinition, context: PlanContext): string | null {
  const split = def.split;
  if (split === undefined) return null;
  if (split.board === SAME) return def.name;
  return context.boardName?.(split.board) ?? split.board;
}

function laterStepChanges(
  live: BoardDefinition,
  draft: BoardDefinition,
  id: string,
  context: PlanContext,
): Change[] {
  const out: Change[] = [];
  const old = stepById(live, id);
  const step = stepById(draft, id);
  if (!old || !step) return out;
  const { name } = step;
  const skips = (def: BoardDefinition, s: typeof step) =>
    def.steps[0]?.id === s.id && s.skipWhenReady && s.reviewer === 'none';
  if (skips(live, old) !== skips(draft, step)) {
    const to = defaultWay(draft, id);
    out.push({
      kind: 'skip',
      step: id,
      name,
      to: stepById(draft, to)?.name ?? to,
      on: skips(draft, step),
    });
  }
  const before = backWaysOf(live, id);
  const after = backWaysOf(draft, id);
  const you = step.doer === 'you';
  for (const to of after.filter((target) => !before.includes(target)))
    out.push({
      kind: 'way_back',
      step: id,
      name,
      to: stepById(draft, to)?.name ?? to,
      you,
      on: true,
    });
  for (const to of before.filter((target) => !after.includes(target)))
    out.push({
      kind: 'way_back',
      step: id,
      name,
      to: stepById(live, to)?.name ?? to,
      you,
      on: false,
    });
  if (old.note.req !== step.note.req)
    out.push({ kind: 'note', step: id, name, on: step.note.req === 'always' });
  if (!same(old.waits, step.waits)) {
    const board = step.waits.includes('parts') ? splitName(draft, context) : null;
    out.push({ kind: 'waits', step: id, name, waits: step.waits, ...(board ? { board } : {}) });
  }
  if (old.doerMayDrop !== step.doerMayDrop)
    out.push({ kind: 'doer_drop', step: id, name, on: step.doerMayDrop });
  return out;
}

// `openParts` and `openBlockers`: how many of the item's parts are open, and how many open items
// block it (for the effects of a new wait); left out, none.
export type ItemState = { id: string; state: string; openParts?: number; openBlockers?: number };

export type ItemEffects = {
  // Items in steps the draft removes: where they go needs a choice; `suggested` is the next step
  // that stays, or Hecho.
  moves: { step: string; name: string; items: string[]; suggested: Target }[];
  // Items being worked on in a step whose handoff now requires more.
  needs: { step: string; name: string; items: string[]; parts: string[] }[];
  // Items waiting in a review the draft no longer has: they go back to work in the same step.
  reopened: { step: string; name: string; items: string[] }[];
  // Items being worked on in a step that now waits, whose parts or blockers are still open: they
  // cannot be handed off until those finish.
  waiting: { step: string; name: string; wait: Wait; items: string[] }[];
  // Items in the review of a step the protected branch is now pushed in: their branch is frozen.
  frozen: { step: string; name: string; items: string[] }[];
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
  return true;
}

export function itemEffects(
  live: BoardDefinition,
  draft: BoardDefinition,
  items: readonly ItemState[],
): ItemEffects {
  const out: ItemEffects = { moves: [], needs: [], reopened: [], waiting: [], frozen: [] };
  const open = items.flatMap((item) => {
    const at = positionOf(item.state);
    return isClosed(at) ? [] : [{ ...item, step: at.step, phase: at.phase }];
  });
  const wasPushed = new Set(guardedBranch(live)?.guard.push ?? []);
  for (const stepId of guardedBranch(draft)?.guard.push ?? []) {
    const step = stepById(draft, stepId);
    if (!step || wasPushed.has(stepId)) continue;
    const here = open.filter((item) => item.step === stepId && item.phase !== 'doing');
    if (here.length > 0)
      out.frozen.push({ step: stepId, name: step.name, items: here.map(({ id }) => id) });
  }
  for (const step of draft.steps) {
    const old = stepById(live, step.id);
    for (const wait of step.waits) {
      if (old?.waits.includes(wait)) continue;
      const count = (item: ItemState) => (wait === 'parts' ? item.openParts : item.openBlockers);
      const held = open.filter(
        (item) => item.step === step.id && item.phase === 'doing' && (count(item) ?? 0) > 0,
      );
      if (held.length > 0)
        out.waiting.push({ step: step.id, name: step.name, wait, items: held.map(({ id }) => id) });
    }
  }
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
  const motives = new Set(draft.drop.motives.map(({ id }) => id));
  for (const item of items) {
    const at = positionOf(item.state);
    // A discard whose motive the draft no longer has reads as plain Descartado.
    if (isClosed(at)) {
      if (at.motive !== undefined && !motives.has(at.motive))
        out.push({ id: item.id, from: item.state, to: DROPPED });
      continue;
    }
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
