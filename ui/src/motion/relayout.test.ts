import { describe, expect, it } from 'vitest';
import { RELAYOUT_LEAVES } from './relayout.ts';

// The list compacting beside the detail moves as one: its leaves, and the lanes they hang on. On a
// wide screen the centred panel travels hundreds of pixels to the left; lines drawn at their new
// place at once would leave the rows behind them on the way.
describe('what the list relayout carries', () => {
  it('carries every leaf and the lanes drawn beside them', () => {
    expect(RELAYOUT_LEAVES).toContain('[data-leaf]');
    expect(RELAYOUT_LEAVES).toContain('.lanes > svg.ink');
  });
});
