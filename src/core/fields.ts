import { OteaError } from './errors.ts';
import type { FieldSpec, Preset } from './preset.ts';

export type FieldValues = Record<string, string>;

export type Intake = { title: string; fields: FieldValues; state: string };

function isBlank(value: string | undefined): value is undefined {
  return value === undefined || value.trim() === '';
}

export function valueProblem(name: string, spec: FieldSpec, value: string): string | undefined {
  if (spec.values && !spec.values.includes(value)) {
    return `field "${name}" must be one of ${spec.values.join(', ')}`;
  }
  return undefined;
}

export function intake(preset: Preset, input: FieldValues): Intake {
  const problems = Object.keys(input)
    .filter((name) => !(name in preset.fields))
    .map((name) => `unknown field "${name}"`);
  const values: FieldValues = {};
  let complete = true;
  for (const [name, spec] of Object.entries(preset.fields)) {
    const given = input[name];
    const value = isBlank(given) ? spec.default : given;
    if (value === undefined) {
      if (spec.required === 'create') problems.push(`missing required field "${name}"`);
      if (spec.required === 'complete') complete = false;
      continue;
    }
    const problem = valueProblem(name, spec, value);
    if (problem) problems.push(problem);
    values[name] = value;
  }
  if (problems.length > 0) throw new OteaError('invalid_fields', problems.join('; '));
  const { title = '', ...fields } = values;
  const { initial, incomplete } = preset.workflow;
  return { title, fields, state: complete ? initial : (incomplete ?? initial) };
}

export type Change = { from: string | null; to: string | null };

export type Revision = {
  title: string;
  fields: Record<string, unknown>;
  changes: Record<string, Change>;
};

export type Content = { title: string; fields: Record<string, unknown> };

function stored(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function revise(preset: Preset, current: Content, input: FieldValues): Revision {
  const values: Record<string, unknown> = { ...current.fields, title: current.title };
  const problems: string[] = [];
  const changes: Record<string, Change> = {};
  for (const [name, given] of Object.entries(input)) {
    const spec = preset.fields[name];
    if (!spec) {
      problems.push(`unknown field "${name}"`);
      continue;
    }
    const next = isBlank(given) ? null : given;
    if (next === null && spec.required === 'create') {
      problems.push(`field "${name}" is required and cannot be cleared`);
      continue;
    }
    const problem = next === null ? undefined : valueProblem(name, spec, next);
    if (problem) problems.push(problem);
    const previous = stored(values[name]);
    if (previous === next) continue;
    changes[name] = { from: previous, to: next };
    if (next === null) delete values[name];
    else values[name] = next;
  }
  if (problems.length > 0) throw new OteaError('invalid_fields', problems.join('; '));
  const { title, ...fields } = values;
  return { title: String(title), fields, changes };
}

export function missingToComplete(preset: Preset, fields: Record<string, unknown>): string[] {
  return Object.entries(preset.fields)
    .filter(([name, spec]) => {
      const value = fields[name];
      return spec.required === 'complete' && (typeof value !== 'string' || value.trim() === '');
    })
    .map(([name]) => name);
}
