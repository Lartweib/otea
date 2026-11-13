import { startsWith, waysOf } from './engine.ts';
import {
  type BoardDefinition,
  DONE,
  isAgent,
  isEvidence,
  LEVELS,
  partOf,
  SAME,
  type Selection,
  type Split,
  stepIndex,
  TITLE,
  usedRefs,
  WHEN_KINDS,
} from './model.ts';

// What is wrong with a draft, computed in one place for the editor, the publish dialog and the
// server's draft and publish answers. Errors block Publicar; warnings only inform. Each problem
// carries the card it belongs to (`at`) and the words it needs (`params`); the UI says it in the
// language on screen, so no problem ever reaches a person as a key or a stack trace.

export type ProblemCode =
  | 'board_unnamed'
  | 'board_name_taken'
  | 'no_steps'
  | 'step_unnamed'
  | 'part_unnamed'
  | 'duplicate_name'
  | 'part_missing'
  | 'reserved_name'
  | 'when_unreadable'
  | 'way_invalid'
  | 'back_invalid'
  | 'cap_invalid'
  | 'agent_offline'
  | 'self_review'
  | 'agent_closes'
  | 'wait_no_split'
  | 'skip_invalid'
  | 'split_cycle'
  | 'split_unknown'
  | 'guard_no_push'
  | 'guard_base'
  | 'initial_invalid'
  | 'motive_agent_drop';

export type ProblemLevel = 'error' | 'warning';

// `uses` (duplicate_name) lists what shares the name: title, field, evidence or step, in board order.
export type ProblemParams = Record<string, string | number | string[]>;

export type Problem = {
  level: ProblemLevel;
  code: ProblemCode;
  params: ProblemParams;
  at: Selection;
};

export type ProblemContext = {
  // The project's agents and whether each is connected now.
  agents: readonly { name: string; connected: boolean }[];
  // The names of the project's other boards (live or draft), compared without case.
  takenNames?: readonly string[];
  // This board's id and the project's boards (this one included), to check what a split names.
  id?: string;
  boards?: readonly BoardRef[];
};

// A board as a split reads it: its id, name and what it divides into.
export type BoardRef = { id: string; name: string; split?: Split };

// Words Otea already uses for its own things, in both languages, compared without case.
export const RESERVED_NAMES = [
  'done',
  'dropped',
  'hecho',
  'descartado',
  'publish',
  'publicar',
  'stuck',
  'atasco',
  'turn',
  'turno',
  'your turn',
  'te toca',
  'round',
  'ronda',
  'draft',
  'borrador',
];

const key = (name: string) => name.trim().toLocaleLowerCase();

export function problemsOf(def: BoardDefinition, context: ProblemContext): Problem[] {
  const out: Problem[] = [];
  const add = (level: ProblemLevel, code: ProblemCode, at: Selection, params = {}) =>
    out.push({ level, code, params, at });
  const used = usedRefs(def);
  const partAt = (ref: string): Selection => {
    if (def.form.some((entry) => entry.ref === ref)) return { kind: 'form' };
    const step = def.steps.find(({ hand }) => hand.some((entry) => entry.ref === ref));
    if (step) return { kind: 'part', id: ref, step: step.id };
    return { kind: 'anytime' };
  };

  if (key(def.name) === '') add('error', 'board_unnamed', { kind: 'about' });
  else if ((context.takenNames ?? []).some((name) => key(name) === key(def.name)))
    add('error', 'board_name_taken', { kind: 'about' }, { name: def.name.trim() });
  if (def.steps.length === 0) add('error', 'no_steps', { kind: 'form' });

  for (const step of def.steps) {
    if (key(step.name) === '') add('error', 'step_unnamed', { kind: 'step', id: step.id });
  }
  const parts = Object.values(def.parts).filter(({ id }) => used.has(id));
  for (const part of parts) {
    if (key(part.name) === '') add('error', 'part_unnamed', partAt(part.id));
  }

  // One name space: the title, the parts in use and the steps.
  const names = new Map<string, { name: string; uses: string[] }>();
  const claim = (name: string, use: string, at: Selection) => {
    const k = key(name);
    if (k === '') return;
    const seen = names.get(k);
    if (!seen) {
      names.set(k, { name: name.trim(), uses: [use] });
      return;
    }
    seen.uses.push(use);
    if (seen.uses.length === 2)
      add('error', 'duplicate_name', at, { name: seen.name, uses: seen.uses });
  };
  claim(def.title, 'title', { kind: 'form' });
  for (const part of parts)
    claim(part.name, isEvidence(part) ? 'evidence' : 'field', partAt(part.id));
  for (const step of def.steps) claim(step.name, 'step', { kind: 'step', id: step.id });

  for (const step of def.steps) {
    for (const hand of step.hand) {
      if (!partOf(def, hand.ref)) add('error', 'part_missing', { kind: 'step', id: step.id });
    }
  }
  for (const ref of [...def.form.map((entry) => entry.ref), ...def.anytime]) {
    if (!partOf(def, ref))
      add('error', 'part_missing', { kind: ref === TITLE ? 'form' : 'anytime' });
  }

  for (const step of def.steps) {
    if (RESERVED_NAMES.includes(key(step.name)))
      add('warning', 'reserved_name', { kind: 'step', id: step.id }, { name: step.name.trim() });
  }

  for (const step of def.steps) {
    const readable = new Set([...startsWith(def, step.id).map(({ ref }) => ref), ...def.anytime]);
    for (const hand of step.hand) {
      if (hand.req !== 'when') continue;
      const read = hand.when ? partOf(def, hand.when.part) : undefined;
      const ok =
        hand.when !== undefined &&
        read !== undefined &&
        WHEN_KINDS.includes(read.kind as never) &&
        readable.has(hand.when.part) &&
        hand.when.value !== '';
      if (!ok)
        add(
          'error',
          'when_unreadable',
          { kind: 'part', id: hand.ref, step: step.id },
          { part: partOf(def, hand.ref)?.name ?? '', step: step.name },
        );
    }
  }

  // A way leads to another step, later or earlier (taken back), or to Hecho; never to itself.
  def.steps.forEach((step, index) => {
    for (const way of step.ways) {
      const at = stepIndex(def, way);
      if (way !== DONE && (at < 0 || at === index))
        add('error', 'way_invalid', { kind: 'step', id: step.id }, { step: step.name });
    }
  });
  def.steps.forEach((step, index) => {
    if (step.back === SAME) return;
    const back = stepIndex(def, step.back);
    if (back < 0 || back > index)
      add('error', 'back_invalid', { kind: 'step', id: step.id }, { step: step.name });
  });

  if (def.cap.on && (!Number.isInteger(def.cap.n) || def.cap.n < 1))
    add('error', 'cap_invalid', { kind: 'about' });

  const connected = new Set(context.agents.filter((a) => a.connected).map(({ name }) => name));
  for (const step of def.steps) {
    const seen = new Set<string>();
    for (const who of [step.doer, step.reviewer]) {
      if (!isAgent(who) || connected.has(who.agent) || seen.has(who.agent)) continue;
      seen.add(who.agent);
      add(
        'warning',
        'agent_offline',
        { kind: 'step', id: step.id },
        { agent: who.agent, step: step.name },
      );
    }
  }

  // Only you say something is Hecho: an agent may not close an item as done, by handing it off with
  // nobody reviewing or by approving it.
  for (const step of def.steps) {
    const closer = step.reviewer === 'none' ? step.doer : step.reviewer;
    if (closer === 'you' || !waysOf(def, step.id).includes(DONE)) continue;
    add('error', 'agent_closes', { kind: 'step', id: step.id }, { step: step.name });
  }

  for (const step of def.steps) {
    if (step.doer === 'you' && step.reviewer === 'you')
      add('warning', 'self_review', { kind: 'step', id: step.id }, { step: step.name });
  }
  out.push(...laterProblems(def, context, partAt));
  return out;
}

// The settings boards gained to say what presets did: waits, skipping on creation, the split, the
// protected branch, start values and motives.
function laterProblems(
  def: BoardDefinition,
  context: ProblemContext,
  partAt: (ref: string) => Selection,
): Problem[] {
  const out: Problem[] = [];
  const add = (level: ProblemLevel, code: ProblemCode, at: Selection, params = {}) =>
    out.push({ level, code, params, at });
  const used = usedRefs(def);
  def.steps.forEach((step, index) => {
    const at: Selection = { kind: 'step', id: step.id };
    if (step.waits.includes('parts') && !def.split)
      add('error', 'wait_no_split', at, { step: step.name, board: def.name });
    if (step.skipWhenReady && (index > 0 || step.reviewer !== 'none'))
      add('error', 'skip_invalid', at, { step: step.name });
  });
  const split = def.split;
  if (split && split.board !== SAME && context.boards && context.id !== undefined) {
    const other = context.boards.find(({ id }) => id === split.board);
    if (!other) add('error', 'split_unknown', { kind: 'about' }, { board: def.name });
    else if (other.split?.board === context.id)
      add('error', 'split_cycle', { kind: 'about' }, { board: def.name, other: other.name });
  }
  for (const part of Object.values(def.parts)) {
    if (!used.has(part.id)) continue;
    if (part.guard && !part.guard.push.some((id) => stepIndex(def, id) >= 0))
      add('error', 'guard_no_push', partAt(part.id), { part: part.name });
    if (part.guard?.base !== undefined && !isBranchName(part.guard.base))
      add('error', 'guard_base', partAt(part.id), { part: part.name });
    if (part.initial !== undefined && !initialFits(part.kind, part.options, part.initial))
      add('error', 'initial_invalid', partAt(part.id), { part: part.name });
  }
  if (def.drop.motives.length > 0) {
    const dropper = def.steps.find((step) => step.doerMayDrop && step.doer !== 'you');
    if (dropper) add('warning', 'motive_agent_drop', { kind: 'done' }, { step: dropper.name });
  }
  return out;
}

// A git branch name as a person types one: no spaces or the characters git refuses, no "..", not
// starting with a slash or a dot, nor ending with one.
function isBranchName(name: string): boolean {
  return /^(?![./])(?!.*\.\.)(?!.*[./]$)[^\s~^:?*[\\]+$/.test(name);
}

function initialFits(kind: string, options: readonly { id: string }[], value: string): boolean {
  if (kind === 'level') return (LEVELS as readonly string[]).includes(value);
  if (kind === 'yesno') return value === 'yes' || value === 'no';
  if (kind === 'choice') return options.some(({ id }) => id === value);
  return false;
}

export function blocking(problems: readonly Problem[]): boolean {
  return problems.some(({ level }) => level === 'error');
}
