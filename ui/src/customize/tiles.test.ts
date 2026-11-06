import { describe, expect, it } from 'vitest';
import type { Part } from '../studio/canvas.ts';
import { tileKeys } from './tiles.ts';

const row = (index: number): Part => ({ type: 'bug', slot: 'row', index });

describe('tile keys', () => {
  it('are never the same for two tiles, even for a part drawn in every row of a list', () => {
    const keys = tileKeys([row(0), row(1), row(0), row(0), row(1)]);

    expect(new Set(keys).size).toBe(5);
  });

  it('stay the same for the same part while nothing else changes', () => {
    const parts = [row(0), row(0), { type: 'bug', slot: 'body', index: 2, section: 1 } as Part];

    expect(tileKeys(parts)).toEqual(tileKeys([...parts]));
    expect(tileKeys(parts)[2]).toBe('body:1:2:0');
  });
});
