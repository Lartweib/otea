import { OteaError } from '../errors.ts';
import { isClosed, positionOf, stateOf } from './engine.ts';
import {
  type BoardDefinition,
  CHOICE_KINDS,
  DONE,
  DROPPED,
  isAgent,
  isEvidence,
  LEVELS,
  type Part,
  stepById,
  TITLE,
  usedRefs,
} from './model.ts';
import { DONE_NAME, DROPPED_NAME } from './next.ts';

// What a reader of a board item meets and types: names, never the hidden ids under them. An agent
// fills `--field Tamaño=Una`, attaches `--module Bocetos`, and reads `state: Concepto (in review)`;
// the ids stay the storage keys. Pure and browser-safe.

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase();
}

// The parts a reader can name: every part the board uses, the title first.
function namedParts(def: BoardDefinition): Part[] {
  const used = usedRefs(def);
  return Object.values(def.parts).filter((part) => used.has(part.id));
}

// A part by its name or its id; undefined when the board has none.
export function partByName(def: BoardDefinition, key: string): Part | undefined {
  if (key === TITLE || fold(key) === fold(def.title)) return undefined;
  if (def.parts[key]) return def.parts[key];
  const wanted = fold(key);
  return Object.values(def.parts).find((part) => fold(part.name) === wanted);
}

function namesOf(parts: readonly Part[]): string {
  return parts.map(({ name }) => name).join(', ');
}

// The level scale's words in English and Spanish, each reading as its key.
const LEVEL_WORDS: Readonly<Record<string, (typeof LEVELS)[number]>> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
  baja: 'low',
  media: 'medium',
  alta: 'high',
  critica: 'critical',
};

function oneChoice(part: Part, given: string): string {
  const wanted = fold(given);
  const found = part.options.find(({ id, name }) => id === given || fold(name) === wanted);
  if (!found)
    throw new OteaError(
      'invalid_fields',
      `${part.name} must be one of ${part.options.map(({ name }) => name).join(', ')}`,
    );
  return found.id;
}

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  const text = String(value).trim();
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Not JSON: names joined by commas.
    }
  }
  return text
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function valueFor(part: Part, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return value;
  if (part.kind === 'choice') return oneChoice(part, String(value));
  if (part.kind === 'multi' || part.kind === 'check')
    return JSON.stringify(listOf(value).map((piece) => oneChoice(part, piece)));
  if (part.kind === 'level') {
    const key = LEVEL_WORDS[fold(String(value))];
    if (!key)
      throw new OteaError('invalid_fields', `${part.name} must be one of ${LEVELS.join(', ')}`);
    return key;
  }
  if (part.kind === 'yesno') {
    const word = fold(String(value));
    if (['yes', 'si', 'true'].includes(word)) return 'yes';
    if (['no', 'false'].includes(word)) return 'no';
    throw new OteaError('invalid_fields', `${part.name} must be yes or no`);
  }
  return value;
}

// `--description` (and MCP's `description`) on a board with no field of that name: the long text
// named Description in English or Spanish, else the board's only long text. Refuses, naming the
// long texts, a board with several and none of them the description, or with none.
const DESCRIPTION = 'description';
const DESCRIPTION_NAMES = new Set([DESCRIPTION, 'descripcion']);

function descriptionOf(def: BoardDefinition): Part {
  const long = namedParts(def).filter((part) => part.kind === 'long');
  const named = long.filter((part) => DESCRIPTION_NAMES.has(fold(part.name)));
  const pool = named.length > 0 ? named : long;
  if (pool.length === 1 && pool[0]) return pool[0];
  throw new OteaError(
    'invalid_fields',
    long.length === 0
      ? `${def.name} has no description field; its fields are ${fieldNames(def).join(', ')}`
      : `${def.name} has no description field; fill one of its long texts by name: ${namesOf(long)}`,
  );
}

// The fields a reader typed, by name or id, as the item stores them: by part id, with choices as
// their ids. Refuses, in words, a name the board has not and a value no choice has.
export function readFieldInput(
  def: BoardDefinition,
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === TITLE || fold(key) === fold(def.title)) {
      out[TITLE] = value;
      continue;
    }
    const part =
      partByName(def, key) ?? (fold(key) === DESCRIPTION ? descriptionOf(def) : undefined);
    if (!part || isEvidence(part)) {
      throw new OteaError(
        'invalid_fields',
        `${def.name} has no field "${key}"; its fields are ${fieldNames(def).join(', ')}`,
      );
    }
    if (part.id in out) throw new OteaError('invalid_fields', `${part.name} given twice`);
    out[part.id] = valueFor(part, value);
  }
  return out;
}

// The evidence part a reader names (`--module Bocetos`), as the module id it was compiled to.
export function evidenceByName(def: BoardDefinition, key: string): string {
  const part = partByName(def, key);
  if (part && isEvidence(part)) return part.id;
  throw new OteaError(
    'evidence_not_accepted',
    `${def.name} has no evidence "${key}"; its evidence is ${namesOf(namedParts(def).filter(isEvidence))}`,
  );
}

// A state as a reader says it: the step's name, with its review when it is one.
export function stateName(def: BoardDefinition, state: string): string {
  const position = positionOf(state);
  if (isClosed(position)) return position.closed === DONE ? DONE_NAME : DROPPED_NAME;
  const name = stepById(def, position.step)?.name ?? position.step;
  if (position.phase === 'review') return `${name} (in review)`;
  if (position.phase === 'yours') return `${name} (the person's review)`;
  return name;
}

// Every state of the board's compiled workflow, closed ones included.
function statesOf(def: BoardDefinition): string[] {
  return [
    ...def.steps.flatMap((step) => {
      const doing = stateOf({ step: step.id, phase: 'doing' });
      if (step.reviewer === 'none') return [doing];
      const review = stateOf({ step: step.id, phase: 'review' });
      if (!isAgent(step.reviewer)) return [doing, review];
      return [doing, review, stateOf({ step: step.id, phase: 'yours' })];
    }),
    DONE,
    DROPPED,
  ];
}

// The state a reader names (`otea move CRI-1 "Concepto (in review)"`, `Animar`, `Hecho`), or the
// text as given when it names none, so a stored state still reads as itself.
export function stateByName(def: BoardDefinition, text: string): string {
  return findState(def, text) ?? text;
}

// The state a reader names, by name (in any case) or id; undefined when the board has none.
export function findState(def: BoardDefinition, text: string): string | undefined {
  const wanted = fold(text);
  if (['hecho', 'done'].includes(wanted)) return DONE;
  if (['descartado', 'dropped'].includes(wanted)) return DROPPED;
  return statesOf(def).find((state) => state === text || fold(stateName(def, state)) === wanted);
}

// The names a reader can give the board's states, in its order: each step, its reviews, then
// Done and Dropped.
export function stateNames(def: BoardDefinition): string[] {
  return [...new Set(statesOf(def).map((state) => stateName(def, state)))];
}

// The names a reader can give the board's fields, its evidence aside.
export function fieldNames(def: BoardDefinition): string[] {
  return namedParts(def)
    .filter((part) => !isEvidence(part))
    .map(({ name }) => name);
}

// A stored value as a reader says it: choices by their names.
export function valueName(part: Part, value: unknown): string {
  if (CHOICE_KINDS.includes(part.kind as never) && value !== null && value !== undefined)
    return listOf(value)
      .map((id) => part.options.find((choice) => choice.id === id)?.name ?? id)
      .join(', ');
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// An item's fields by name, choices by name, for a reader.
export function fieldsByName(
  def: BoardDefinition,
  fields: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const part = def.parts[key];
    out[part?.name ?? key] = part
      ? valueName(part, value)
      : valueName({ id: key, name: key, kind: 'text', hint: '', options: [] }, value);
  }
  return out;
}
