// A board as Studio edits it: a row of steps laid on the two lanes (agents above, you below), the
// parts each step hands off, the creation form, how the item page is arranged and the instructions
// agents read. Every name is free text a person typed; a hidden id sits under every board, step,
// part (field or evidence) and choice, so a rename never breaks history, mentions or items.
//
// This module is pure and browser-safe: the server, the CLI, MCP and the web UI import it.

export const FIELD_KINDS = [
  'text',
  'long',
  'check',
  'choice',
  'multi',
  'level',
  'number',
  'date',
  'yesno',
  'url',
  'branch',
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

export const EVIDENCE_KINDS = [
  'images',
  'video',
  'audio',
  'code',
  'log',
  'diagram',
  'file',
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type PartKind = FieldKind | EvidenceKind;

// How a piece of evidence shows on the item page, for the kinds that show in more than one way.
// The first is the default.
export const EVIDENCE_SHOWS: Readonly<Partial<Record<EvidenceKind, readonly string[]>>> = {
  images: ['gallery', 'one', 'ba'],
  video: ['strip', 'player'],
};

// The fixed scale of the level kind, from least to most severe (the severity module's keys).
export const LEVELS = ['low', 'medium', 'high', 'critical'] as const;

// The kinds a "required only when…" can read: a value the item already carries.
export const WHEN_KINDS: readonly FieldKind[] = ['choice', 'multi', 'level', 'yesno'];

// The kinds whose values are the part's own choices.
export const CHOICE_KINDS: readonly FieldKind[] = ['choice', 'multi', 'check'];

export function isEvidenceKind(kind: string): kind is EvidenceKind {
  return (EVIDENCE_KINDS as readonly string[]).includes(kind);
}

export function isFieldKind(kind: string): kind is FieldKind {
  return (FIELD_KINDS as readonly string[]).includes(kind);
}

export type Choice = { id: string; name: string };

// A field (something to fill) or a piece of evidence (something to show). Both share the board's
// one name space. `hint` is "Qué va aquí", the line agents read. `options` hold the choices of a
// choice, multi or checklist field. `show` is how evidence shows (EVIDENCE_SHOWS).
export type Part = {
  id: string;
  name: string;
  kind: PartKind;
  hint: string;
  options: Choice[];
  show?: string;
  // "Empieza en…": the value a new item starts with, on choice (a choice id), level (a LEVELS key)
  // and yes-or-no ('yes' | 'no') fields.
  initial?: string;
  // "Otea protege esta rama", on a branch field only: pushes are allowed only while one of `push`
  // (step ids) is being done, never during its review, and merging only at Hecho. `repo` is the
  // field (part id) the repository's name is read from.
  guard?: Guard;
};

export type Guard = { push: string[]; repo?: string };

// How a long text shows on the item page: as text, or as options side by side (### A · Name).
export const LONG_SHOWS = ['text', 'options'] as const;

// The kinds a "Empieza en…" reads.
export const INITIAL_KINDS: readonly FieldKind[] = ['choice', 'level', 'yesno'];

// The title is the one field every item has. It is not stored in `parts`: its ref is TITLE and its
// name is the board's `title`.
export const TITLE = 'title';

// Who does a step, and who reviews it. An agent is named by its Otea agent name (claude-b).
export type AgentRef = { agent: string };
export type Doer = 'you' | 'any' | AgentRef;
export type Reviewer = 'none' | 'you' | AgentRef;

// Required: always; only when another part the item already carries has a value; or never.
export type Requirement = 'always' | 'when' | 'no';

// `when` says which part and value make it required: a choice id, a level key, yes or no.
export type When = { part: string; value: string };

// One thing a step hands off. `fresh`: new in each round (evidence only), so a send-back empties it.
export type Hand = { ref: string; req: Requirement; when?: When; fresh: boolean };

// Where a way leads: a later step's id, or DONE.
export const DONE = 'done';
export const DROPPED = 'dropped';
export type Target = string;

// The instructions agents read on a step: when they take it, before they hand it off, and when an
// agent reviews it.
export type StepInstructions = { take: string; before: string; review: string };

// What an Entrega waits for besides its parts: `parts`, that none of the item's parts (the items it
// divides into) is still open; `blockers`, that nothing open blocks it, on any board.
export const WAITS = ['parts', 'blockers'] as const;
export type Wait = (typeof WAITS)[number];

// "Nota de la entrega": a note the doer writes with each handoff, kept with the round. `hint` is
// "Qué va aquí".
export type Note = { req: 'no' | 'always'; hint: string };

// `ways` are the alternatives to the default way (the next step, or DONE after the last one), and
// the earlier steps the doer may take the item back to ("o regresarlo a…", always with a reason,
// with no review, starting that step's next round). `back` is where a send-back lands: SAME (this
// step) or an earlier step's id.
// `skipWhenReady` (first step only, nobody reviews it): an item created with everything its Entrega
// asks for starts at the next step. `doerMayDrop`: an agent doing it may drop the item, saying why.
export const SAME = 'same';
export type Step = {
  id: string;
  name: string;
  doer: Doer;
  reviewer: Reviewer;
  hand: Hand[];
  ways: Target[];
  back: string;
  instructions: StepInstructions;
  note: Note;
  waits: Wait[];
  skipWhenReady: boolean;
  doerMayDrop: boolean;
};

// A step's settings that every new step starts with.
export function stepDefaults(): Pick<Step, 'note' | 'waits' | 'skipWhenReady' | 'doerMayDrop'> {
  return { note: { req: 'no', hint: '' }, waits: [], skipWhenReady: false, doerMayDrop: false };
}

// Where a part shows on the item page (Acomodar). The list row is `row`, an ordered list of refs.
export const ZONES = ['top', 'main', 'side', 'hidden'] as const;
export type Zone = (typeof ZONES)[number];

// The cap on the agents' own items: they add items only while fewer than `n` wait for you.
export type Cap = { on: boolean; n: number };

// "Se divide en": the board each item's parts are on (a board's hidden id, or SAME for this board),
// and whether a part is always part of one (`always`: it is never created alone).
export type Split = { board: string; always: boolean };

// Who may discard ("Descartar lo haces tú, desde la página o pidiéndoselo a un agente / solo desde
// la página") and the motives a discard names (each one its own closed state).
export type Drop = { by: 'page' | 'anyone'; motives: Choice[] };

// How the published list shows its items, and what it groups them by: a part id (a choice, level
// or yes-or-no field), STEP or MOTIVE.
export type ListView = { as: 'list' | 'table'; group?: string };
export const STEP = 'step';
export const MOTIVE = 'motive';

// Two places Acomodar lays out besides the parts: the rounds of the review, and the item's parts.
export const ROUNDS = 'rounds';
export const PARTS = 'parts';
export const PLACES: readonly string[] = [ROUNDS, PARTS];

export const BOARD_SCHEMA = 2;

export type BoardDefinition = {
  schema: typeof BOARD_SCHEMA;
  name: string;
  // What each item is called ("Criatura").
  item: string;
  icon: string;
  // The name of the title field ("Título").
  title: string;
  parts: Record<string, Part>;
  // The creation form, besides the title, which it always asks for.
  form: { ref: string; required: boolean }[];
  steps: Step[];
  // Parts that can be filled at any time, whatever the step.
  anytime: string[];
  layout: Record<string, Zone>;
  row: string[];
  // "Sobre este tablero" and "Cuando no hay nada que hacer".
  about: string;
  idle: string;
  cap: Cap;
  // Titles of the sample items the previews draw; never items of the board.
  samples: string[];
  // The template it was copied from, for the record only: nothing stays linked to it.
  template?: string;
  split?: Split;
  drop: Drop;
  list: ListView;
};

// A board's settings that every new board starts with.
export function boardDefaults(): Pick<BoardDefinition, 'drop' | 'list'> {
  return { drop: { by: 'anyone', motives: [] }, list: { as: 'list' } };
}

// A selection in the editor: what a problem, a change or a "¿por qué está aquí?" points at.
export type Selection =
  | { kind: 'step'; id: string }
  | { kind: 'part'; id: string; step?: string }
  | { kind: 'form' }
  | { kind: 'done' }
  | { kind: 'about' }
  | { kind: 'anytime' };

export function isAgent(who: Doer | Reviewer): who is AgentRef {
  return typeof who === 'object' && who !== null && 'agent' in who;
}

export function sameWho(a: Doer | Reviewer, b: Doer | Reviewer): boolean {
  if (isAgent(a) && isAgent(b)) return a.agent === b.agent;
  return a === b;
}

export function stepById(def: BoardDefinition, id: string): Step | undefined {
  return def.steps.find((step) => step.id === id);
}

export function stepIndex(def: BoardDefinition, id: string): number {
  return def.steps.findIndex((step) => step.id === id);
}

// A part by ref, the title included; undefined for a ref that names nothing.
export function partOf(def: BoardDefinition, ref: string): Part | undefined {
  if (ref === TITLE) return { id: TITLE, name: def.title, kind: 'text', hint: '', options: [] };
  return def.parts[ref];
}

export function isEvidence(part: Part): boolean {
  return isEvidenceKind(part.kind);
}

// The motive of a discard, by id.
export function motiveById(def: BoardDefinition, id: string): Choice | undefined {
  return def.drop.motives.find((motive) => motive.id === id);
}

// The protected branch field, with its guard, when the board has one.
export function guardedBranch(def: BoardDefinition): (Part & { guard: Guard }) | undefined {
  return Object.values(def.parts).find(
    (part): part is Part & { guard: Guard } => part.kind === 'branch' && part.guard !== undefined,
  );
}

// The default way out of a step: the next step, or DONE after the last.
export function defaultWay(def: BoardDefinition, stepId: string): Target {
  const index = stepIndex(def, stepId);
  return def.steps[index + 1]?.id ?? DONE;
}

// Every part a draft uses: on the form, in a handoff or at any time. Unused parts stay in `parts`
// (so undo and reuse keep them) but are not part of the board's name space.
export function usedRefs(def: BoardDefinition): Set<string> {
  return new Set([
    ...def.form.map(({ ref }) => ref),
    ...def.steps.flatMap(({ hand }) => hand.map(({ ref }) => ref)),
    ...def.anytime,
  ]);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
