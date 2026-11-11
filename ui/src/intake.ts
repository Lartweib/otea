import { presetText, t } from './i18n/i18n.ts';
import type { Lane } from './lanes/geometry.ts';
import type { Look } from './lanes/looks.ts';
import { type NodeKind, nodeKind } from './node-kind.ts';
import { fieldWord, stateWord } from './preset-words.ts';
import type { FieldView, Turn, TypeView } from './types.ts';

export type FormValues = Record<string, string>;

export type Start = { state: string; incomplete: boolean; missing: string[] };

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function blankFields(
  { fields }: TypeView,
  values: FormValues,
  required: FieldView['required'],
): string[] {
  return fields
    .filter((field) => field.required === required)
    .filter((field) => isBlank(values[field.name]) && isBlank(field.default))
    .map((field) => field.name);
}

export function initialValues({ fields }: TypeView): FormValues {
  return Object.fromEntries(fields.map((field) => [field.name, field.default ?? '']));
}

// A field's name as its label: the preset's words, never translated (presetText).
export function fieldLabel(name: string): string {
  const words = name.replaceAll('_', ' ');
  return presetText(words.charAt(0).toUpperCase() + words.slice(1));
}

export function fieldHint(field: FieldView): string | undefined {
  return field.required === 'complete' ? t('intake.leftToAgent') : undefined;
}

export function missingToCreate(type: TypeView, values: FormValues): string[] {
  return blankFields(type, values, 'create');
}

export function canSubmit(type: TypeView, values: FormValues): boolean {
  return missingToCreate(type, values).length === 0;
}

export function startOf(type: TypeView, values: FormValues): Start {
  const missing = blankFields(type, values, 'complete');
  const { initial, incomplete } = type;
  if (missing.length === 0 || incomplete === undefined) {
    return { state: initial, incomplete: false, missing: [] };
  }
  return { state: incomplete, incomplete: true, missing };
}

export function payloadOf(values: FormValues): FormValues {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !isBlank(value)));
}

// The state and fields in the preset's words for the language on screen, when the type gives them.
export function startMessage({ state, incomplete, missing }: Start, type?: TypeView): string {
  const shown = stateWord(type, state);
  if (!incomplete) return t('intake.startsReady', { state: shown });
  const fields = missing.map((name) => fieldWord(type, name) ?? name);
  return t('intake.startsIncomplete', { state: shown, fields: fields.join(', ') });
}

// Where the item lands once created, as the row the form draws while you type: the state it starts
// in and whose turn that is. Until every field required to create it is filled it is a draft.
export type Landing = {
  state: string;
  turn: Turn;
  kind: NodeKind;
  ready: boolean;
  missing: string[];
};

export function landingOf(type: TypeView, values: FormValues): Landing {
  const start = startOf(type, values);
  const state = type.states.find(({ name }) => name === start.state);
  const turn = state?.turn ?? 'agent';
  const missing = missingToCreate(type, values);
  const ready = missing.length === 0;
  const facts = { turn, leased: false, incomplete: start.incomplete };
  const kind = ready
    ? nodeKind(state?.closes === undefined ? facts : { ...facts, closes: state.closes })
    : 'incomplete';
  return { state: start.state, turn, kind, ready, missing };
}

// In the preset's words for the language on screen, when the type gives them.
export function landingNote(
  { state: name, turn, ready, missing }: Landing,
  type?: TypeView,
): string {
  if (!ready) {
    const fields = missing.map((field) => fieldWord(type, field) ?? fieldLabel(field));
    return t('intake.draft', { fields: fields.join(', ') });
  }
  const state = stateWord(type, name);
  if (turn === 'human') return t('intake.landsOnYou', { state });
  if (turn === 'agent') return t('intake.landsOnAgent', { state });
  return t('intake.landsIn', { state });
}

// The id the item will most likely get: the next number in its collection. The server numbers it.
export function nextId(prefix: string, ids: readonly string[]): string {
  const head = `${prefix}-`;
  const last = ids
    .filter((id) => id.startsWith(head))
    .map((id) => Number(id.slice(head.length)))
    .filter(Number.isInteger)
    .reduce((max, seq) => Math.max(max, seq), 0);
  return `${head}${last + 1}`;
}

// The row the form draws under "llega como" (mock:3912-3915): on the lane of the turn it starts
// on, yours when it is your turn, queued for an agent, closed on the trunk.
export function landingLook({ turn, kind }: Pick<Landing, 'turn' | 'kind'>): {
  lane: Lane;
  look: Look;
} {
  if (turn === 'human') return { lane: 'you', look: 'yours' };
  if (turn === 'agent') return { lane: 'ag', look: 'queued' };
  return { lane: 'none', look: kind === 'discarded' ? 'dropped' : 'done' };
}

// The form's lede (mock:3904): "En Errores, como hijo de ERR-1. Llega a un agente, en Encontrado."
export function ledeOf({
  board,
  parent,
  landing,
  step,
}: {
  board: string;
  parent?: string | undefined;
  landing: Pick<Landing, 'turn'>;
  step: string;
}): string {
  const lands =
    landing.turn === 'human'
      ? t('intake.ledeYou', { step })
      : landing.turn === 'agent'
        ? t('intake.ledeAgent', { step })
        : t('intake.ledeClosed', { step });
  return parent
    ? t('intake.ledeChild', { board, parent, lands })
    : t('intake.lede', { board, lands });
}
