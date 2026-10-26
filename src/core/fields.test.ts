import { describe, expect, it } from 'vitest';
import { intake } from './fields.ts';
import type { Preset } from './preset.ts';
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
