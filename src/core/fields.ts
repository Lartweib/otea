import { OteaError } from './errors.ts';
import type { FieldSpec, Labels, Shape } from './preset.ts';
import { stateLabel, turnOf } from './workflow.ts';

export type FieldValues = Record<string, string>;

export type Intake = { title: string; fields: FieldValues; state: string };

function isBlank(value: string | undefined): value is undefined {
  return value === undefined || value.trim() === '';
}

// The name a reader knows a field by: its label (a board part's name), or its key.
function said(name: string, spec: FieldSpec): string {
  return spec.label ?? name;
}

export function valueProblem(name: string, spec: FieldSpec, value: string): string | undefined {
  if (spec.values && !spec.values.includes(value)) {
    return `field "${said(name, spec)}" must be one of ${spec.values.join(', ')}`;
  }
  return undefined;
}

export function intake(preset: Shape, input: FieldValues): Intake {
  const unknown = Object.keys(input).filter((name) => !(name in preset.fields));
  const problems = unknown.map((name) => `unknown field "${name}"`);
  // The fields refused, by key, for a program to read beside the names in the message.
  const refused = [...unknown];
  const values: FieldValues = {};
  let complete = true;
  for (const [name, spec] of Object.entries(preset.fields)) {
    const given = input[name];
    const value = isBlank(given) ? spec.default : given;
    if (value === undefined) {
      if (spec.required === 'create') {
        problems.push(`missing required field "${said(name, spec)}"`);
        refused.push(name);
      }
      if (spec.required === 'complete') complete = false;
      continue;
    }
    const problem = valueProblem(name, spec, value);
    if (problem) {
      problems.push(problem);
      refused.push(name);
    }
    values[name] = value;
  }
  if (problems.length > 0)
    throw new OteaError('invalid_fields', problems.join('; '), {
      kind: 'invalid_fields',
      fields: refused,
    });
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

export function revise(preset: Shape, current: Content, input: FieldValues): Revision {
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
      problems.push(`field "${said(name, spec)}" is required and cannot be cleared`);
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

export function missingToComplete(preset: Shape, fields: Record<string, unknown>): string[] {
  return Object.entries(preset.fields)
    .filter(([name, spec]) => {
      const value = fields[name];
      return spec.required === 'complete' && (typeof value !== 'string' || value.trim() === '');
    })
    .map(([name]) => name);
}

export function assertCanLeave(
  preset: Shape & { labels?: Labels },
  from: string,
  to: string,
  fields: Record<string, unknown>,
): void {
  const { workflow } = preset;
  if (from !== workflow.incomplete || turnOf(workflow, to) === 'none') return;
  const missing = missingToComplete(preset, fields);
  if (missing.length === 0) return;
  throw new OteaError(
    'missing_fields',
    `Cannot move from "${stateLabel(workflow, from)}" to "${stateLabel(workflow, to)}" while fields required to complete are missing: ${missing.map((key) => preset.fields[key]?.label ?? key).join(', ')}`,
    {
      kind: 'fields_missing',
      fields: missing.map((key) => {
        const said = Object.entries(preset.labels ?? {}).flatMap(([language, words]) => {
          const label = words.fields[key];
          return label === undefined ? [] : [[language, label] as const];
        });
        return said.length === 0 ? { key } : { key, labels: Object.fromEntries(said) };
      }),
    },
  );
}

// A field key from a name someone typed ("Found in build" gives found_in_build), unique among the
// keys already taken: a clash gets _2, _3, and so on.
export function fieldKeyFor(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[0-9]+/, '') || 'field';
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}
