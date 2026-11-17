import { type BoardDefinition, type FieldKind, LEVELS, type Part } from './model.ts';

// Analysis views cross a board's items to help pick what to tackle first (the effort × risk matrix
// of the bug triage panel). A view never names a board's field: it asks for roles, and a board says
// which of its own fields plays each role (`analysis` in board.json, mapped in Studio). A view shows
// only on a board that mapped the roles it needs, so no board is tied to a view.
//
// This module is pure and browser-safe: the server, the CLI and the web UI import it.

export const SCALE_ROLES = ['effort', 'risk', 'impact'] as const;
export const ROLES = [...SCALE_ROLES, 'area', 'due'] as const;

export type ScaleRole = (typeof SCALE_ROLES)[number];
export type Role = (typeof ROLES)[number];

// The board's mapping: each role to one of its parts (by id), or nothing.
export type Analysis = Partial<Record<Role, string>>;

// The kinds a role reads. A scale is an order of values: a level (low → critical), a number, or a
// choice whose options, in their order, are the scale. An area groups (a choice, several, or a
// short text); a due date is a date. A long text never plays a role.
export const ROLE_KINDS: Readonly<Record<Role, readonly FieldKind[]>> = {
  effort: ['choice', 'level', 'number'],
  risk: ['choice', 'level', 'number'],
  impact: ['choice', 'level', 'number'],
  area: ['choice', 'multi', 'text'],
  due: ['date'],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isScaleRole(role: Role): role is ScaleRole {
  return (SCALE_ROLES as readonly string[]).includes(role);
}

export function fitsRole(role: Role, part: Part): boolean {
  return (ROLE_KINDS[role] as readonly string[]).includes(part.kind);
}

// The parts of a board that may play a role, in board order.
export function partsFor(def: BoardDefinition, role: Role): Part[] {
  return Object.values(def.parts).filter((part) => fitsRole(role, part));
}

// The part a role is mapped to, when the board has it and it still fits.
export function rolePart(def: BoardDefinition, role: Role): Part | undefined {
  const ref = def.analysis?.[role];
  if (ref === undefined) return undefined;
  const part = def.parts[ref];
  return part && fitsRole(role, part) ? part : undefined;
}

// The scale roles a board mapped (to parts that fit), in role order.
export function mappedScales(def: BoardDefinition): ScaleRole[] {
  return SCALE_ROLES.filter((role) => rolePart(def, role) !== undefined);
}

export const VIEWS = ['matrix'] as const;
export type AnalysisView = (typeof VIEWS)[number];

// The views a board turns on: the matrix crosses any two scale roles.
export function viewsOf(def: BoardDefinition): AnalysisView[] {
  return mappedScales(def).length >= 2 ? ['matrix'] : [];
}

// The default axes of the matrix: effort across and risk up when both are mapped, else the first
// two scale roles the board mapped.
export function defaultAxes(def: BoardDefinition): { x: ScaleRole; y: ScaleRole } | undefined {
  const scales = mappedScales(def);
  if (scales.length < 2) return undefined;
  if (scales.includes('effort') && scales.includes('risk')) return { x: 'effort', y: 'risk' };
  const [x, y] = scales as [ScaleRole, ScaleRole];
  return { x, y };
}

// A step of a scale: its stored value and the words it reads.
export type ScaleStep = { value: string; name: string };

// The steps of a part's scale, lowest first. A number part has no fixed steps: its scale is the
// distinct values the items carry, sorted (`values`); a level reads its keys, which the caller
// words in the language on screen.
export function scaleOf(part: Part, values: readonly string[] = []): ScaleStep[] {
  if (part.kind === 'level') return LEVELS.map((level) => ({ value: level, name: level }));
  if (part.kind === 'choice') return part.options.map(({ id, name }) => ({ value: id, name }));
  if (part.kind === 'number') {
    const numbers = [
      ...new Set(
        values
          .filter((v) => v.trim() !== '')
          .map(Number)
          .filter(Number.isFinite),
      ),
    ].sort((a, b) => a - b);
    return numbers.map((n) => ({ value: String(n), name: String(n) }));
  }
  return [];
}

// Where a value sits on a scale (0 lowest), or undefined when the item has no value there.
export function stepOf(steps: readonly ScaleStep[], value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const index = steps.findIndex(
    (step) => step.value === value || Number(step.value) === Number(value),
  );
  return index === -1 ? undefined : index;
}
