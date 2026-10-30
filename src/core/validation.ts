import { missingToComplete, valueProblem } from './fields.ts';
import { DEFAULT_TYPE, type ItemType, type Preset } from './preset.ts';

export type Severity = 'error' | 'warning';

export type Finding = { severity: Severity; subject: string; message: string };

export type StoredItem = {
  id: string;
  type: string;
  title: string;
  state: string;
  fields: Record<string, unknown>;
  presetVersion: number;
};

function fieldMessages(type: ItemType, item: StoredItem, of: string): Array<[Severity, string]> {
  const found: Array<[Severity, string]> = [];
  for (const [name, value] of Object.entries(item.fields)) {
    const spec = type.fields[name];
    if (!spec || name === 'title') {
      found.push(['warning', `field "${name}" is not declared by ${of}`]);
    } else if (typeof value !== 'string') {
      found.push(['error', `field "${name}" must be a string, got ${typeof value}`]);
    } else {
      const problem = valueProblem(name, spec, value);
      if (problem) found.push(['error', problem]);
    }
  }
  const values: Record<string, unknown> = { ...item.fields, title: item.title };
  for (const [name, spec] of Object.entries(type.fields)) {
    const value = values[name];
    const missing = value === undefined || (typeof value === 'string' && value.trim() === '');
    if (spec.required === 'create' && missing) {
      found.push(['error', `missing required field "${name}"`]);
    }
  }
  return found;
}

function typeMessages(type: ItemType, item: StoredItem, of: string): Array<[Severity, string]> {
  const found: Array<[Severity, string]> = [];
  const { workflow } = type;
  const state = workflow.states.find(({ name }) => name === item.state);
  if (!state) found.push(['error', `unknown state "${item.state}" in ${of}`]);
  found.push(...fieldMessages(type, item, of));
  if (state && state.turn !== 'none' && state.name !== workflow.incomplete) {
    for (const name of missingToComplete(type, item.fields)) {
      found.push(['warning', `missing field "${name}" required to complete`]);
    }
  }
  return found;
}

export function itemFindings(preset: Preset, item: StoredItem): Finding[] {
  const found: Array<[Severity, string]> = [];
  const type = preset.types.find(({ name }) => name === item.type);
  if (type) {
    const own =
      preset.types.length === 1 && type.name === DEFAULT_TYPE ? '' : ` (type ${type.name})`;
    found.push(...typeMessages(type, item, `preset ${preset.name}${own}`));
  } else {
    const names = preset.types.map(({ name }) => name).join(', ');
    found.push(['error', `unknown type "${item.type}" in preset ${preset.name} (types: ${names})`]);
  }
  if (item.presetVersion < preset.version) {
    found.push([
      'warning',
      `written under preset ${preset.name} v${item.presetVersion}; the preset is now v${preset.version}`,
    ]);
  }
  return found.map(([severity, message]) => ({ severity, subject: item.id, message }));
}
