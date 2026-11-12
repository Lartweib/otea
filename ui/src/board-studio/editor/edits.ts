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
  stepDefaults,
  stepIndex,
  MOTIVE,
  type Target,
  TITLE,
  usedRefs,
  WAITS,
  type Wait,
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

// Which way each step's ways lead (later or Done: forward; earlier: back), to keep after a move.
type Directions = Map<string, Map<string, 'forward' | 'back'>>;

function directionsOf(def: BoardDefinition): Directions {
  return new Map(
    def.steps.map((s, index) => [
      s.id,
      new Map(
        s.ways.map((way) => [
          way,
          way === DONE || stepIndex(def, way) > index ? ('forward' as const) : ('back' as const),
        ]),
      ),
    ]),
  );
}

// After steps move or go: a way leads later (or to Done) or back to an earlier step ("o regresarlo
// a…"), never to the step itself; a move never turns a way back into one forward, or the other way
// round; send-backs only land here or earlier; and nothing points at a step that is gone. The
// protected branch is pushed only during steps that still exist.
function tidyRoutes(def: BoardDefinition, before?: Directions): void {
  def.steps.forEach((s, index) => {
    const was = before?.get(s.id);
    s.ways = s.ways.filter((way, at, all) => {
      if (all.indexOf(way) !== at) return false;
      if (way === DONE) return true;
      const to = stepIndex(def, way);
      if (to < 0 || to === index) return false;
      const now = to > index ? 'forward' : 'back';
      return !was?.has(way) || was.get(way) === now;
    });
    if (s.back !== SAME) {
      const back = stepIndex(def, s.back);
      if (back < 0 || back >= index) s.back = SAME;
    }
  });
  for (const part of Object.values(def.parts))
    if (part.guard) part.guard.push = part.guard.push.filter((id) => stepIndex(def, id) >= 0);
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
    ...stepDefaults(),
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
  const before = directionsOf(def);
  const [step] = def.steps.splice(from, 1);
  if (step) def.steps.splice(to, 0, step);
  tidyRoutes(def, before);
  sortGuards(def);
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
  if (part.initial !== undefined && part.kind !== 'level' && part.kind !== 'yesno')
    if (!live.has(part.initial)) delete part.initial;
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

// "o regresarlo a…" (or "o devolverlo a…" on your own step): an earlier step the doer may take the
// item back to, saying why. Stored among the ways; the engine tells them apart by position.
const isEarlier = (def: BoardDefinition, stepId: string, target: string) => {
  const at = stepIndex(def, target);
  return target !== DONE && at >= 0 && at < stepIndex(def, stepId);
};

export function addBackWay(def: BoardDefinition, stepId: string, target: string): void {
  if (!isEarlier(def, stepId, target)) return;
  addWay(def, stepId, target);
}

export function replaceBackWay(def: BoardDefinition, stepId: string, old: string, next: string) {
  const step = stepOf(def, stepId);
  if (!step || !isEarlier(def, stepId, next)) return;
  step.ways = step.ways.map((w) => (w === old ? next : w));
  tidyRoutes(def);
}

export function removeBackWay(def: BoardDefinition, stepId: string, target: string): void {
  removeWay(def, stepId, target);
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

// ---- the handoff note, waits, skip on creation, the doer dropping it ----

// "Nota de la entrega": once per step. Its row shows while it is required or says what goes there.
export function addNote(def: BoardDefinition, stepId: string, hint: string): void {
  const step = stepOf(def, stepId);
  if (step) step.note = { req: 'always', hint };
}

// Optional keeps the row: with nothing said about it yet, it takes `fallback` as what goes there.
export function setNoteReq(
  def: BoardDefinition,
  stepId: string,
  req: 'always' | 'no',
  fallback: string,
): void {
  const step = stepOf(def, stepId);
  if (!step) return;
  step.note = { req, hint: req === 'no' && !step.note.hint.trim() ? fallback : step.note.hint };
}

export function setNoteHint(def: BoardDefinition, stepId: string, hint: string): void {
  const step = stepOf(def, stepId);
  if (step) step.note = { ...step.note, hint };
}

export function removeNote(def: BoardDefinition, stepId: string): void {
  const step = stepOf(def, stepId);
  if (step) step.note = { req: 'no', hint: '' };
}

// Whether a step has the note row ("Nota de la entrega").
export function hasNote(step: Step): boolean {
  return step.note.req === 'always' || step.note.hint.trim() !== '';
}

export function addWait(def: BoardDefinition, stepId: string, wait: Wait): void {
  const step = stepOf(def, stepId);
  if (!step || step.waits.includes(wait)) return;
  step.waits = WAITS.filter((w) => w === wait || step.waits.includes(w));
}

export function removeWait(def: BoardDefinition, stepId: string, wait: Wait): void {
  const step = stepOf(def, stepId);
  if (step) step.waits = step.waits.filter((w) => w !== wait);
}

export function setSkip(def: BoardDefinition, stepId: string, on: boolean): void {
  const step = stepOf(def, stepId);
  if (step) step.skipWhenReady = on;
}

export function setDoerMayDrop(def: BoardDefinition, stepId: string, on: boolean): void {
  const step = stepOf(def, stepId);
  if (step) step.doerMayDrop = on;
}

// ---- field settings: where it starts, a protected branch ----

export function setInitial(def: BoardDefinition, ref: string, value: string | undefined): void {
  const part = def.parts[ref];
  if (!part) return;
  if (value === undefined || value === '') delete part.initial;
  else part.initial = value;
}

function sortGuards(def: BoardDefinition): void {
  for (const part of Object.values(def.parts))
    if (part.guard) part.guard.push.sort((a, b) => stepIndex(def, a) - stepIndex(def, b));
}

// "Otea protege esta rama": on a branch field only, pushed during `push` (step ids).
export function setGuard(def: BoardDefinition, ref: string, on: boolean, push: string[] = []) {
  const part = def.parts[ref];
  if (!part || part.kind !== 'branch') return;
  if (!on) {
    delete part.guard;
    return;
  }
  part.guard = { push: push.filter((id) => stepIndex(def, id) >= 0) };
  sortGuards(def);
}

export function toggleGuardPush(def: BoardDefinition, ref: string, stepId: string): void {
  const guard = def.parts[ref]?.guard;
  if (!guard || stepIndex(def, stepId) < 0) return;
  guard.push = guard.push.includes(stepId)
    ? guard.push.filter((id) => id !== stepId)
    : [...guard.push, stepId];
  sortGuards(def);
}

export function setGuardRepo(def: BoardDefinition, ref: string, repo: string | undefined): void {
  const guard = def.parts[ref]?.guard;
  if (!guard) return;
  if (repo === undefined || repo === '') delete guard.repo;
  else guard.repo = repo;
}

// ---- discarding: who, and with which motive ----

export function setDropBy(def: BoardDefinition, by: 'page' | 'anyone'): void {
  def.drop = { ...def.drop, by };
}

// A motive's id is the closed state it names (dropped__<id>): its name in lowercase letters,
// digits and underscores, or a fresh id when the name has none.
function motiveId(def: BoardDefinition, name: string, make: IdSource): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = /^[a-z]/.test(slug) ? slug : slug ? `m_${slug}` : make('c');
  const taken = new Set(def.drop.motives.map((m) => m.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

export function addMotive(def: BoardDefinition, name: string, make: IdSource = ids): void {
  const clean = name.trim();
  if (!clean || def.drop.motives.some((m) => key(m.name) === key(clean))) return;
  def.drop = {
    ...def.drop,
    motives: [...def.drop.motives, { id: motiveId(def, clean, make), name: clean }],
  };
}

export function removeMotive(def: BoardDefinition, id: string): void {
  def.drop = { ...def.drop, motives: def.drop.motives.filter((m) => m.id !== id) };
  if (def.list.group === MOTIVE && def.drop.motives.length === 0) def.list = { as: def.list.as };
}

// ---- what each item divides into ----

// "Cada X se divide en…": another board (always part of one, by default), this same board, or
// nothing. A step that waited for its parts keeps waiting (and says so as a problem).
export function setSplit(def: BoardDefinition, board: string | undefined): void {
  if (board === undefined || board === '') {
    delete def.split;
    return;
  }
  def.split = { board, always: board !== SAME };
}

export function setSplitAlways(def: BoardDefinition, always: boolean): void {
  if (def.split && def.split.board !== SAME) def.split = { ...def.split, always };
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
