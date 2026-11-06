import { describe, expect, it } from 'vitest';
import { fieldKeyFor } from './fields.ts';

describe('fieldKeyFor', () => {
  it('derives a snake_case key from a typed name', () => {
    expect(fieldKeyFor('Found in build', [])).toBe('found_in_build');
    expect(fieldKeyFor('  Ñandú / 2 ', [])).toBe('nandu_2');
  });
  it('is unique among taken keys', () => {
    expect(fieldKeyFor('Found in build', ['found_in_build', 'found_in_build_2'])).toBe(
      'found_in_build_3',
    );
  });
  it('falls back when nothing usable remains', () => {
    expect(fieldKeyFor('123', [])).toBe('field');
  });
});
