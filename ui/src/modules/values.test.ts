import { describe, expect, it } from 'vitest';
import type { FieldView } from '../types.ts';
import { valuesOf } from './values.ts';

const priority: FieldView = { name: 'priority', module: 'enum', values: ['low', 'high'] };

describe('field values', () => {
  it('pairs each value with its preset field, in the order of the values', () => {
    expect(valuesOf([priority], { notes: 'n', priority: 'high' })).toEqual([
      { field: { name: 'notes', module: 'text' }, value: 'n' },
      { field: priority, value: 'high' },
    ]);
  });

  it('shows a value without a known field as text, also while the preset is loading', () => {
    expect(valuesOf(undefined, { priority: 'high' })).toEqual([
      { field: { name: 'priority', module: 'text' }, value: 'high' },
    ]);
  });
});
