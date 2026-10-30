import { describe, expect, it } from 'vitest';
import type { ItemType } from './preset.ts';
import { mixedPreset, tasksPreset } from './testing.ts';
import { itemFindings, type StoredItem } from './validation.ts';

const item = (overrides: Partial<StoredItem> = {}): StoredItem => ({
  id: 'TASKS-1',
  type: 'item',
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
      { fields: { description: 'D', priority: 42 } },
      ['error', 'field "priority" must be a string, got number'],
    ],
    [
      'an enum value outside its values',
      { fields: { description: 'D', priority: 'urgent' } },
      ['error', 'field "priority" must be one of low, medium, high'],
    ],
    ['a missing title', { title: ' ' }, ['error', 'missing required field "title"']],
    [
      'a field the preset does not declare',
      { fields: { description: 'D', owner: 'ana' } },
      ['warning', 'field "owner" is not declared by preset tasks'],
    ],
  ])('reports %s', (_, overrides, finding) => {
    expect(messages(overrides)).toEqual([finding]);
  });

  it('reports a missing create-required field', () => {
    const [only] = tasksPreset.types;
    const owner = { module: 'text' as const, required: 'create' as const };
    const fields = { ...only?.fields, owner };
    const preset = { ...tasksPreset, types: [{ ...(only as ItemType), fields }] };

    expect(itemFindings(preset, item()).map(({ message }) => message)).toEqual([
      'missing required field "owner"',
    ]);
  });

  it('warns about a working item that lacks complete-required fields', () => {
    expect(messages({ state: 'todo', fields: {} })).toEqual([
      ['warning', 'missing field "description" required to complete'],
    ]);
  });

  it('does not warn about closed items that lack complete-required fields', () => {
    expect(messages({ state: 'done', fields: {} })).toEqual([]);
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

  describe('in a preset with several types', () => {
    const work = (overrides: Partial<StoredItem>) =>
      itemFindings(mixedPreset, {
        id: 'WORK-1',
        type: 'bug',
        title: 'Crash',
        state: 'reported',
        fields: { severity: 'high' },
        presetVersion: 1,
        ...overrides,
      }).map(({ severity, message }) => [severity, message]);

    it('checks an item against the fields and workflow of its own type', () => {
      expect(work({})).toEqual([]);
      expect(work({ type: 'impr', state: 'idea', fields: { pitch: 'Faster' } })).toEqual([]);
      expect(work({ type: 'impr', state: 'reported', fields: { severity: 'high' } })).toEqual([
        ['error', 'unknown state "reported" in preset work (type impr)'],
        ['warning', 'field "severity" is not declared by preset work (type impr)'],
      ]);
      expect(work({ fields: {} })).toEqual([['error', 'missing required field "severity"']]);
    });

    it('reports an item of a type the preset does not declare', () => {
      expect(work({ type: 'item' })).toEqual([
        ['error', 'unknown type "item" in preset work (types: bug, impr)'],
      ]);
    });
  });
});
