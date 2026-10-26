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
