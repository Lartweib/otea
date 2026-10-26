import { valueProblem } from './fields.ts';
import type { Preset } from './preset.ts';

export type Severity = 'error' | 'warning';

export type Finding = { severity: Severity; subject: string; message: string };

export type StoredItem = {
  id: string;
  title: string;
  state: string;
  fields: Record<string, unknown>;
  presetVersion: number;
};

function fieldMessages(preset: Preset, item: StoredItem): Array<[Severity, string]> {
  const found: Array<[Severity, string]> = [];
  for (const [name, value] of Object.entries(item.fields)) {
    const spec = preset.fields[name];
    if (!spec || name === 'title') {
      found.push(['warning', `field "${name}" is not declared by preset ${preset.name}`]);
    } else if (typeof value !== 'string') {
      found.push(['error', `field "${name}" must be a string, got ${typeof value}`]);
    } else {
      const problem = valueProblem(name, spec, value);
      if (problem) found.push(['error', problem]);
    }
  }
  const values: Record<string, unknown> = { ...item.fields, title: item.title };
  for (const [name, spec] of Object.entries(preset.fields)) {
    const value = values[name];
    const missing = value === undefined || (typeof value === 'string' && value.trim() === '');
    if (spec.required === 'create' && missing) {
      found.push(['error', `missing required field "${name}"`]);
    }
  }
  return found;
}

export function itemFindings(preset: Preset, item: StoredItem): Finding[] {
  const found: Array<[Severity, string]> = [];
  if (!preset.workflow.states.some(({ name }) => name === item.state)) {
    found.push(['error', `unknown state "${item.state}" in preset ${preset.name}`]);
  }
  found.push(...fieldMessages(preset, item));
  if (item.presetVersion < preset.version) {
    found.push([
      'warning',
      `written under preset ${preset.name} v${item.presetVersion}; the preset is now v${preset.version}`,
    ]);
  }
  return found.map(([severity, message]) => ({ severity, subject: item.id, message }));
}
