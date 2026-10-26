import { parse } from 'yaml';
import { z } from 'zod';
import { OteaError } from './errors.ts';
import { AUTHORITIES, type Transition, TURNS, type Workflow } from './workflow.ts';

export const FIELD_MODULES = ['text', 'markdown', 'enum'] as const;

export type FieldModule = (typeof FIELD_MODULES)[number];

export type FieldRequirement = 'create' | 'complete';

export type FieldSpec = {
  module: FieldModule;
  required?: FieldRequirement;
  values?: string[];
  default?: string;
};

export type Preset = {
  name: string;
  version: number;
  playbook?: string;
  fields: Record<string, FieldSpec>;
  workflow: Workflow;
};

export type PresetReading = { ok: true; preset: Preset } | { ok: false; problems: string[] };

const NAME = /^[a-z0-9][a-z0-9-]*$/;
const KEY = /^[a-z][a-z0-9_]*$/;

const fieldSchema = z.strictObject({
  module: z.string(),
  required: z.enum(['create', 'complete']).optional(),
  values: z.array(z.string()).nonempty().optional(),
  default: z.string().optional(),
});

const transitionSchema = z.strictObject({
  from: z.union([z.string(), z.array(z.string()).nonempty()]),
  to: z.string(),
  by: z.enum(AUTHORITIES),
  reason: z.literal('required').optional(),
});

const presetSchema = z.strictObject({
  preset: z.string().regex(NAME, 'must be lowercase letters, digits and dashes'),
  preset_version: z.int().positive(),
  playbook: z.string().optional(),
  fields: z.record(z.string().regex(KEY, 'field names must be snake_case'), fieldSchema),
  workflow: z.strictObject({
    initial: z.string(),
    incomplete: z.string().optional(),
    states: z.record(
      z.string().regex(KEY, 'state names must be snake_case'),
      z.strictObject({ turn: z.enum(TURNS) }),
    ),
    transitions: z.array(transitionSchema),
  }),
});

type RawPreset = z.infer<typeof presetSchema>;
type RawField = z.infer<typeof fieldSchema>;

function isModule(module: string): module is FieldModule {
  return (FIELD_MODULES as readonly string[]).includes(module);
}

function fieldProblems(name: string, field: RawField): string[] {
  const at = `fields.${name}`;
  const problems: string[] = [];
  if (!isModule(field.module)) {
    problems.push(
      `${at}.module: unknown module "${field.module}" (official: ${FIELD_MODULES.join(', ')})`,
    );
  }
  if (field.module === 'enum' && !field.values) {
    problems.push(`${at}.values: required by the enum module`);
  }
  if (field.module !== 'enum' && field.values) {
    problems.push(`${at}.values: only the enum module takes values`);
  }
  if (field.values && field.default !== undefined && !field.values.includes(field.default)) {
    problems.push(`${at}.default: "${field.default}" is not one of ${field.values.join(', ')}`);
  }
  return problems;
}

function titleProblems(title: RawField | undefined): string[] {
  if (!title) return ['fields.title: missing; every preset needs a title field'];
  const problems: string[] = [];
  if (title.module !== 'text') problems.push('fields.title: must use the text module');
  if (title.required !== 'create') problems.push('fields.title: must be required: create');
  return problems;
}

function expand(raw: RawPreset): Transition[] {
  return raw.workflow.transitions.flatMap(({ from, to, by, reason }) =>
    [from]
      .flat()
      .map((source) => ({ from: source, to, by, reasonRequired: reason === 'required' })),
  );
}

function transitionProblems(raw: RawPreset): string[] {
  const states = raw.workflow.states;
  const problems: string[] = [];
  const seen = new Set<string>();
  raw.workflow.transitions.forEach(({ from, to, by }, index) => {
    const at = `workflow.transitions.${index}`;
    for (const source of [from].flat()) {
      if (!(source in states)) problems.push(`${at}.from: unknown state "${source}"`);
      const key = JSON.stringify([source, to, by]);
      if (seen.has(key))
        problems.push(`${at}: duplicate transition "${source}" -> "${to}" by ${by}`);
      seen.add(key);
      if (source === to) problems.push(`${at}: "${source}" -> "${to}" does not change state`);
    }
    if (!(to in states)) problems.push(`${at}.to: unknown state "${to}"`);
  });
  return problems;
}

function reachable(entries: string[], transitions: Transition[]): Set<string> {
  const reached = new Set(entries);
  const pending = [...entries];
  for (let state = pending.pop(); state !== undefined; state = pending.pop()) {
    for (const { from, to } of transitions) {
      if (from === state && !reached.has(to)) {
        reached.add(to);
        pending.push(to);
      }
    }
  }
  return reached;
}

function stateProblems(raw: RawPreset, transitions: Transition[]): string[] {
  const { initial, incomplete, states } = raw.workflow;
  const problems: string[] = [];
  if (!(initial in states)) problems.push(`workflow.initial: unknown state "${initial}"`);
  if (incomplete !== undefined && !(incomplete in states)) {
    problems.push(`workflow.incomplete: unknown state "${incomplete}"`);
  }
  if (incomplete === initial) problems.push('workflow.incomplete: must differ from initial');
  const completeFields = Object.entries(raw.fields).filter(([, f]) => f.required === 'complete');
  if (incomplete === undefined) {
    for (const [name] of completeFields) {
      problems.push(`workflow.incomplete: missing, but field "${name}" is required: complete`);
    }
  }
  const entries = [initial, incomplete ?? initial].filter((entry) => entry in states);
  const reached = reachable(entries, transitions);
  for (const [name, { turn }] of Object.entries(states)) {
    const at = `workflow.states.${name}`;
    const leaves = transitions.some(({ from }) => from === name);
    if (entries.length > 0 && !reached.has(name)) {
      problems.push(`${at}: not reachable from the initial or incomplete state`);
    }
    if (turn === 'none' && leaves) problems.push(`${at}: has turn none but outgoing transitions`);
    if (turn !== 'none' && !leaves) {
      problems.push(`${at}: has turn ${turn} but no outgoing transitions`);
    }
  }
  return problems;
}

function toField(field: RawField): FieldSpec {
  const spec: FieldSpec = { module: field.module as FieldModule };
  if (field.required) spec.required = field.required;
  if (field.values) spec.values = [...field.values];
  if (field.default !== undefined) spec.default = field.default;
  return spec;
}

function toPreset(raw: RawPreset, transitions: Transition[]): Preset {
  const workflow: Workflow = {
    name: raw.preset,
    initial: raw.workflow.initial,
    states: Object.entries(raw.workflow.states).map(([name, { turn }]) => ({ name, turn })),
    transitions,
  };
  if (raw.workflow.incomplete !== undefined) workflow.incomplete = raw.workflow.incomplete;
  const fields = Object.fromEntries(
    Object.entries(raw.fields).map(([name, field]) => [name, toField(field)]),
  );
  const preset: Preset = { name: raw.preset, version: raw.preset_version, fields, workflow };
  if (raw.playbook !== undefined) preset.playbook = raw.playbook;
  return preset;
}

function parseYaml(text: string): { ok: true; value: unknown } | { ok: false; problem: string } {
  try {
    return { ok: true, value: parse(text) };
  } catch (error) {
    return { ok: false, problem: `invalid YAML: ${(error as Error).message.split('\n')[0]}` };
  }
}

export function readPreset(text: string): PresetReading {
  const yaml = parseYaml(text);
  if (!yaml.ok) return { ok: false, problems: [yaml.problem] };
  const result = presetSchema.safeParse(yaml.value);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, problems };
  }
  const raw = result.data;
  const transitions = expand(raw);
  const problems = [
    ...titleProblems(raw.fields.title),
    ...Object.entries(raw.fields).flatMap(([name, field]) => fieldProblems(name, field)),
    ...transitionProblems(raw),
    ...stateProblems(raw, transitions),
  ];
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, preset: toPreset(raw, transitions) };
}

export function parsePreset(text: string): Preset {
  const reading = readPreset(text);
  if (reading.ok) return reading.preset;
  throw new OteaError('invalid_preset', `Invalid preset: ${reading.problems.join('; ')}`);
}
