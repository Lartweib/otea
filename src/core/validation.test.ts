import { describe, expect, it } from 'vitest';
import { tasksPreset } from './testing.ts';
import { itemFindings, type StoredItem } from './validation.ts';

const item = (overrides: Partial<StoredItem> = {}): StoredItem => ({
  id: 'TASKS-1',
  title: 'Ship it',
  state: 'todo',
  fields: { description: 'Why', priority: 'medium' },
  presetVersion: 1,
  ...overrides,
});

const messages = (overrides: Partial<StoredItem>) =>
  itemFindings(tasksPreset, item(overrides)).map(({ severity, message }) => [severity, message]);

describe('itemFindings', () => {
  it('finds nothing wrong with an item that matches its preset', () => {
    expect(itemFindings(tasksPreset, item())).toEqual([]);
  });

  it('accepts an incomplete item missing complete-required fields', () => {
    expect(messages({ state: 'incomplete', fields: {} })).toEqual([]);
  });

  it.each<[string, Partial<StoredItem>, [string, string]]>([
    [
      'an unknown state',
      { state: 'archived' },
      ['error', 'unknown state "archived" in preset tasks'],
    ],
    [
      'a field of the wrong type',
      { fields: { description: 42 } },
      ['error', 'field "description" must be a string, got number'],
    ],
    [
      'an enum value outside its values',
      { fields: { priority: 'urgent' } },
      ['error', 'field "priority" must be one of low, medium, high'],
    ],
    ['a missing title', { title: ' ' }, ['error', 'missing required field "title"']],
    [
      'a field the preset does not declare',
      { fields: { owner: 'ana' } },
      ['warning', 'field "owner" is not declared by preset tasks'],
    ],
  ])('reports %s', (_, overrides, finding) => {
    expect(messages(overrides)).toEqual([finding]);
  });

  it('reports a missing create-required field', () => {
    const preset = {
      ...tasksPreset,
      fields: {
        ...tasksPreset.fields,
        owner: { module: 'text' as const, required: 'create' as const },
      },
    };

    expect(itemFindings(preset, item()).map(({ message }) => message)).toEqual([
      'missing required field "owner"',
    ]);
  });

  it('warns about items written under an older preset version', () => {
    const findings = itemFindings({ ...tasksPreset, version: 3 }, item());

    expect(findings).toEqual([
      {
        severity: 'warning',
        subject: 'TASKS-1',
        message: 'written under preset tasks v1; the preset is now v3',
      },
    ]);
  });
});
