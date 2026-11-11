import { describe, expect, it } from 'vitest';
import { type EscapeLayer, topEscape } from './escape.ts';

const entry = (layer: EscapeLayer, seq: number) => ({
  layer,
  seq,
  fn: () => undefined,
});

describe('Escape', () => {
  it('closes a dialog before a pop, a pop before the drawer, the drawer before the detail', () => {
    expect(topEscape([entry('detail', 9), entry('drawer', 2), entry('pop', 1)])?.layer).toBe('pop');
    expect(topEscape([entry('pop', 5), entry('dialog', 1)])?.layer).toBe('dialog');
    expect(topEscape([entry('detail', 3), entry('intake', 1), entry('full', 2)])?.layer).toBe(
      'full',
    );
  });

  it('closes the latest of a layer first, and nothing when nothing is open', () => {
    expect(topEscape([entry('pop', 1), entry('pop', 4)])?.seq).toBe(4);
    expect(topEscape([])).toBeUndefined();
  });
});
