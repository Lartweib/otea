import { describe, expect, it } from 'vitest';
import { assertCanLeave, intake, missingToComplete, revise } from './fields.ts';
import { type Preset, parsePreset } from './preset.ts';
import { tasks } from './testing.ts';

const preset: Preset = {
  name: 'tasks',
  version: 1,
  fields: {
    title: { module: 'text', required: 'create' },
    description: { module: 'markdown', required: 'complete' },
    priority: { module: 'enum', values: ['low', 'medium', 'high'], default: 'medium' },
  },
  workflow: tasks,
};

describe('intake', () => {
  it('starts a complete item in the initial state with defaults applied', () => {
    expect(intake(preset, { title: 'Ship it', description: 'Why and how' })).toEqual({
      title: 'Ship it',
      fields: { description: 'Why and how', priority: 'medium' },
      state: 'todo',
    });
  });

  it('starts an item missing complete-required fields in the incomplete state', () => {
    expect(intake(preset, { title: 'Vague idea', priority: 'high' })).toEqual({
      title: 'Vague idea',
      fields: { priority: 'high' },
      state: 'incomplete',
    });
  });

  it('treats blank values as missing', () => {
    expect(intake(preset, { title: 'X', description: '  ' }).state).toBe('incomplete');
  });

  it('keeps fields in preset order', () => {
    const { fields } = intake(preset, { priority: 'low', description: 'D', title: 'T' });

    expect(Object.keys(fields)).toEqual(['description', 'priority']);
  });

  it.each([
    [{ description: 'D' }, 'missing required field "title"'],
    [{ title: ' ' }, 'missing required field "title"'],
    [{ title: 'T', priority: 'urgent' }, 'field "priority" must be one of low, medium, high'],
    [{ title: 'T', owner: 'ana' }, 'unknown field "owner"'],
  ])('rejects %j with invalid_fields', (values, message) => {
    const attempt = () => intake(preset, values);

    expect(attempt).toThrow(expect.objectContaining({ code: 'invalid_fields' }));
    expect(attempt).toThrow(message);
  });

  it('reports every problem at once', () => {
    expect(() => intake(preset, { priority: 'urgent', owner: 'ana' })).toThrow(
      'unknown field "owner"; missing required field "title"; field "priority" must be one of low, medium, high',
    );
  });
});

describe('revise', () => {
  const current = { title: 'Ship it', fields: { priority: 'medium' } };

  it('applies changes and reports old and new values per changed key', () => {
    expect(revise(preset, current, { description: 'Why', priority: 'high' })).toEqual({
      title: 'Ship it',
      fields: { priority: 'high', description: 'Why' },
      changes: {
        description: { from: null, to: 'Why' },
        priority: { from: 'medium', to: 'high' },
      },
    });
  });

  it('changes the title', () => {
    expect(revise(preset, current, { title: 'Ship it now' })).toMatchObject({
      title: 'Ship it now',
      changes: { title: { from: 'Ship it', to: 'Ship it now' } },
    });
  });

  it('clears a field that is not create-required with a blank value', () => {
    expect(revise(preset, current, { priority: ' ' })).toEqual({
      title: 'Ship it',
      fields: {},
      changes: { priority: { from: 'medium', to: null } },
    });
  });

  it('reports nothing changed when values are equal', () => {
    expect(revise(preset, current, { priority: 'medium' }).changes).toEqual({});
  });

  it.each([
    [{ title: '' }, 'field "title" is required and cannot be cleared'],
    [{ priority: 'urgent' }, 'field "priority" must be one of low, medium, high'],
    [{ owner: 'ana' }, 'unknown field "owner"'],
  ])('rejects %j with invalid_fields', (input, message) => {
    const attempt = () => revise(preset, current, input);

    expect(attempt).toThrow(expect.objectContaining({ code: 'invalid_fields' }));
    expect(attempt).toThrow(message);
  });
});

describe('missingToComplete', () => {
  it('lists complete-required fields without a value', () => {
    expect(missingToComplete(preset, { priority: 'low' })).toEqual(['description']);
    expect(missingToComplete(preset, { description: ' ' })).toEqual(['description']);
    expect(missingToComplete(preset, { description: 'D' })).toEqual([]);
  });
});

describe('assertCanLeave', () => {
  it('rejects leaving incomplete for a working state while complete-required fields are missing', () => {
    const leave = () => assertCanLeave(preset, 'incomplete', 'todo', { priority: 'low' });

    expect(leave).toThrow(expect.objectContaining({ code: 'missing_fields' }));
    expect(leave).toThrow(
      'Cannot move from "incomplete" to "todo" while fields required to complete are missing: description',
    );
  });

  it('allows leaving incomplete once the fields are filled', () => {
    expect(() => assertCanLeave(preset, 'incomplete', 'todo', { description: 'D' })).not.toThrow();
  });

  it('allows closing an incomplete item', () => {
    expect(() => assertCanLeave(preset, 'incomplete', 'discarded', {})).not.toThrow();
  });

  it('ignores moves that do not leave incomplete', () => {
    expect(() => assertCanLeave(preset, 'todo', 'in_progress', {})).not.toThrow();
  });
});

describe('severity values', () => {
  const bugs = parsePreset(`
preset: bugs
preset_version: 1
fields:
  title: { module: text, required: create }
  severity: { module: severity }
workflow:
  initial: open
  states: { open: { turn: agent }, closed: { turn: none } }
  transitions: [{ from: open, to: closed, by: agent }]
`);

  it('takes a level of the scale', () => {
    expect(intake(bugs, { title: 'Crash', severity: 'critical' }).fields).toEqual({
      severity: 'critical',
    });
  });

  it('rejects a value outside the scale at intake and on update', () => {
    const message = 'field "severity" must be one of low, medium, high, critical';
    const content = { title: 'Crash', fields: {} };

    expect(() => intake(bugs, { title: 'Crash', severity: '4' })).toThrow(message);
    expect(() => revise(bugs, content, { severity: 'blocker' })).toThrow(message);
  });
});
