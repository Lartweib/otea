import { type IdKind, type IdSource, newId } from '../../../../src/core/board/ids.ts';
import { mentionSegments, toMentions } from '../../../../src/core/board/mentions.ts';
import {
  type BoardDefinition,
  CHOICE_KINDS,
  DONE,
  type Doer,
  EVIDENCE_SHOWS,
  type EvidenceKind,
  type FieldKind,
  isEvidenceKind,
  type PartKind,
  type Requirement,
  type Reviewer,
  SAME,
  type Step,
  type StepInstructions,
  stepById,
  stepIndex,
  type Target,
  TITLE,
  usedRefs,
  type When,
} from '../../../../src/core/board/model.ts';
import { defaultZone } from '../../../../src/core/board/templates.ts';

// The editor's edits, each a plain change to a draft definition (run inside `mutate`, so each is
// one undo step). Pure: words that depend on the language (a new step's name, a kind's name) come
// in as arguments. Every edit keeps the definition coherent: a removed or moved step never leaves a
// way that goes back or a send-back that goes forward behind it.

const ids: IdSource = newId;
const key = (name: string) => name.trim().toLocaleLowerCase();

// The names a new name must not clash with: the title, every step and every part in use.
function takenNames(def: BoardDefinition): Set<string> {
  const used = usedRefs(def);
  return new Set(
    [
      def.title,
      ...def.steps.map((s) => s.name),
      ...Object.values(def.parts)
        .filter((p) => used.has(p.id))
        .map((p) => p.name),
    ].map(key),
  );
}

// `base`, or `base 2`, `base 3`… the first not taken on the board.
export function uniqueName(def: BoardDefinition, base: string): string {
  const taken = takenNames(def);
  if (!taken.has(key(base))) return base;
  for (let n = 2; ; n++) if (!taken.has(key(`${base} ${n}`))) return `${base} ${n}`;
}

function stepOf(def: BoardDefinition, id: string): Step | undefined {
  return stepById(def, id);
}

// After steps move or go: ways only lead later (or to Done), send-backs only land here or earlier,
// and nothing points at a step that is gone.
function tidyRoutes(def: BoardDefinition): void {
  def.steps.forEach((s, index) => {
    s.ways = s.ways.filter(
      (way, at, all) => all.indexOf(way) === at && (way === DONE || stepIndex(def, way) > index),
    );
    if (s.back !== SAME) {
      const back = stepIndex(def, s.back);
      if (back < 0 || back >= index) s.back = SAME;
    }
  });
}

// ---- steps ----

export function addStep(def: BoardDefinition, at: number, name: string, make: IdSource = ids) {
  const id = make('s');
  const step: Step = {
    id,
    name: uniqueName(def, name),
    doer: 'any',
    reviewer: 'you',
    hand: [],
    ways: [],
    back: SAME,
    instructions: { take: '', before: '', review: '' },
  };
  def.steps.splice(Math.max(0, Math.min(at, def.steps.length)), 0, step);
  return id;
}

export function renameStep(def: BoardDefinition, id: string, name: string): void {
  const step = stepOf(def, id);
  if (step) step.name = name;
}

export function moveStep(def: BoardDefinition, id: string, dir: -1 | 1): void {
  const from = stepIndex(def, id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= def.steps.length) return;
  const [step] = def.steps.splice(from, 1);
  if (step) def.steps.splice(to, 0, step);
  tidyRoutes(def);
}

// The step goes; its parts stay in `parts`, so Deshacer and reuse still find them.
export function removeStep(def: BoardDefinition, id: string): void {
  const at = stepIndex(def, id);
  if (at < 0) return;
  def.steps.splice(at, 1);
  for (const s of def.steps) {
    s.ways = s.ways.filter((way) => way !== id);
    if (s.back === id) s.back = SAME;
  }
  tidyRoutes(def);
}

export function setDoer(def: BoardDefinition, id: string, who: Doer): void {
  const step = stepOf(def, id);
  if (step) step.doer = who;
}

// A send-back is chosen only when you review; any other reviewer keeps the step's own.
export function setReviewer(def: BoardDefinition, id: string, who: Reviewer): void {
  const step = stepOf(def, id);
  if (!step) return;
  step.reviewer = who;
  if (who !== 'you') step.back = SAME;
}

// ---- parts ----

// Where a part goes: a step's handoff, the creation form or any time.
export type PartPlace = { type: 'step'; step: string } | { type: 'form' } | { type: 'anytime' };

function place(def: BoardDefinition, at: PartPlace, ref: string): void {
  const part = def.parts[ref];
  if (at.type === 'step') {
    const step = stepOf(def, at.step);
    if (step && !step.hand.some((h) => h.ref === ref)) {
      const fresh = part?.kind === 'images' || part?.kind === 'video';
      step.hand.push({ ref, req: 'always', fresh });
    }
  } else if (at.type === 'form') {
    if (!def.form.some((f) => f.ref === ref)) def.form.push({ ref, required: false });
  } else if (!def.anytime.includes(ref)) def.anytime.push(ref);
  if (part && !def.layout[ref]) def.layout[ref] = defaultZone(part.kind);
}

// A new part of a kind, named after the kind (made unique), with the starting choices a choice,
// several-choices or checklist field needs.
export function addPart(
  def: BoardDefinition,
  at: PartPlace,
  kind: PartKind,
  words: { name: string; options: readonly string[] },
  make: IdSource = ids,
): string {
  const id = make(isEvidenceKind(kind) ? 'e' : 'f');
  const show = EVIDENCE_SHOWS[kind as EvidenceKind]?.[0];
  const choices = CHOICE_KINDS.includes(kind as FieldKind);
  def.parts[id] = {
    id,
    name: uniqueName(def, words.name),
    kind,
    hint: '',
    options: choices ? words.options.map((name) => ({ id: make('c' as IdKind), name })) : [],
    ...(show === undefined ? {} : { show }),
  };
  place(def, at, id);
  return id;
}

export function reusePart(def: BoardDefinition, at: PartPlace, ref: string): void {
  place(def, at, ref);
}

// Off a list. A part nothing uses any more stays in `parts` (for Deshacer and reuse), and a
// "required only when" that read it becomes required always.
export function removePart(def: BoardDefinition, at: PartPlace, ref: string): void {
  if (at.type === 'step') {
    const step = stepOf(def, at.step);
    if (step) step.hand = step.hand.filter((h) => h.ref !== ref);
  } else if (at.type === 'form') def.form = def.form.filter((f) => f.ref !== ref);
  else def.anytime = def.anytime.filter((r) => r !== ref);
  if (usedRefs(def).has(ref)) return;
  for (const s of def.steps)
    for (const h of s.hand)
      if (h.when?.part === ref) {
        delete h.when;
        h.req = 'always';
      }
}

export function renamePart(def: BoardDefinition, ref: string, name: string): void {
  const part = def.parts[ref];
  if (part) part.name = name;
}

export function setTitleName(def: BoardDefinition, name: string): void {
  def.title = name;
}

export function setHint(def: BoardDefinition, ref: string, hint: string): void {
  const part = def.parts[ref];
  if (part) part.hint = hint;
}

export function setShow(def: BoardDefinition, ref: string, show: string): void {
  const part = def.parts[ref];
  if (part) part.show = show;
}

export function setFormRequired(def: BoardDefinition, ref: string, required: boolean): void {
  const entry = def.form.find((f) => f.ref === ref);
  if (entry) entry.required = required;
}

// The choices of a choice, several-choices or checklist field, by name and in order. A name that
// stays keeps its id (items and "only when" point at ids); a "only when" whose choice is gone waits
// for a new one.
export function setChoices(
  def: BoardDefinition,
  ref: string,
  names: readonly string[],
  make: IdSource = ids,
): void {
  const part = def.parts[ref];
  if (!part) return;
  const left = [...part.options];
  part.options = names.map((name) => {
    const at = left.findIndex((c) => key(c.name) === key(name));
    const kept = at >= 0 ? left.splice(at, 1)[0] : undefined;
    return kept ? { id: kept.id, name } : { id: make('c'), name };
  });
  const live = new Set(part.options.map((c) => c.id));
  for (const s of def.steps)
    for (const h of s.hand)
      if (h.when?.part === ref && !live.has(h.when.value)) h.when = { part: ref, value: '' };
}

export function addChoice(def: BoardDefinition, ref: string, name: string, make: IdSource = ids) {
  const part = def.parts[ref];
  const clean = name.trim();
  if (!part || !clean || part.options.some((c) => key(c.name) === key(clean))) return;
  setChoices(def, ref, [...part.options.map((c) => c.name), clean], make);
}

export function removeChoice(def: BoardDefinition, ref: string, choice: string): void {
  const part = def.parts[ref];
  if (!part) return;
  setChoices(
    def,
    ref,
    part.options.filter((c) => c.id !== choice).map((c) => c.name),
  );
}

// ---- what a step hands off ----

function handOf(def: BoardDefinition, stepId: string, ref: string) {
  return stepOf(def, stepId)?.hand.find((h) => h.ref === ref);
}

// Required always, only when… or optional; optional is never new each round.
export function setRequirement(
  def: BoardDefinition,
  stepId: string,
  ref: string,
  req: Requirement,
  fresh?: boolean,
): void {
  const hand = handOf(def, stepId, ref);
  if (!hand) return;
  hand.req = req;
  if (req !== 'when') delete hand.when;
  if (fresh !== undefined) hand.fresh = fresh;
  if (req === 'no') hand.fresh = false;
}

export function setFresh(def: BoardDefinition, stepId: string, ref: string, fresh: boolean) {
  const hand = handOf(def, stepId, ref);
  if (hand && hand.req !== 'no') hand.fresh = fresh;
}

export function setWhen(def: BoardDefinition, stepId: string, ref: string, when: When): void {
  const hand = handOf(def, stepId, ref);
  if (!hand) return;
  hand.req = 'when';
  hand.when = when;
}

// ---- where it goes next, and back ----

export function addWay(def: BoardDefinition, stepId: string, target: Target): void {
  const step = stepOf(def, stepId);
  if (step && !step.ways.includes(target)) step.ways.push(target);
  tidyRoutes(def);
}

export function replaceWay(def: BoardDefinition, stepId: string, old: Target, next: Target) {
  const step = stepOf(def, stepId);
  if (step) step.ways = step.ways.map((w) => (w === old ? next : w));
  tidyRoutes(def);
}

export function removeWay(def: BoardDefinition, stepId: string, target: Target): void {
  const step = stepOf(def, stepId);
  if (step) step.ways = step.ways.filter((w) => w !== target);
}

export function setBack(def: BoardDefinition, stepId: string, back: string): void {
  const step = stepOf(def, stepId);
  if (step) step.back = back;
}

// ---- instructions ----

export type InstructionAt =
  | { step: string; key: keyof StepInstructions }
  | { board: 'about' | 'idle' };

// The definition as `@` sees it: the title is mentionable too (core mentions list only steps and
// parts, but read a title token by its name).
function withTitle(def: BoardDefinition): BoardDefinition {
  const title = { id: TITLE, name: def.title, kind: 'text' as const, hint: '', options: [] };
  return { ...def, parts: { ...def.parts, [TITLE]: title } };
}

// What `@ mencionar` lists: the steps, the title and the parts in use.
export function mentionChoices(
  def: BoardDefinition,
): { ref: string; name: string; kind: string }[] {
  const used = usedRefs(def);
  return [
    ...def.steps.map((s) => ({ ref: s.id, name: s.name, kind: 'step' })),
    { ref: TITLE, name: def.title, kind: 'text' },
    ...Object.values(def.parts)
      .filter((p) => used.has(p.id))
      .map((p) => ({ ref: p.id, name: p.name, kind: p.kind })),
  ].filter((m) => m.name.trim() !== '');
}

// Typed `@Name`s are stored as tokens, so a mention follows a rename.
export function setInstruction(def: BoardDefinition, at: InstructionAt, text: string): void {
  const stored = toMentions(withTitle(def), text);
  if ('board' in at) {
    def[at.board] = stored;
    return;
  }
  const step = stepOf(def, at.step);
  if (step) step.instructions[at.key] = stored;
}

// Stored text as a person edits it: each token as `@Name` with today's name.
export function editableText(def: BoardDefinition, stored: string): string {
  return mentionSegments(def, stored)
    .map((s) => ('text' in s ? s.text : `@${s.name ?? '…'}`))
    .join('');
}

// ---- the board ----

export function setBoardName(def: BoardDefinition, name: string): void {
  def.name = name;
}

export function setItemName(def: BoardDefinition, item: string): void {
  def.item = item;
}

export function setIcon(def: BoardDefinition, icon: string): void {
  def.icon = icon;
}

export function setCap(def: BoardDefinition, cap: { on?: boolean; n?: number }): void {
  def.cap = { ...def.cap, ...cap };
}
