import { describe, expect, it } from 'vitest';
import { tipWanted } from './Tooltip.tsx';

describe('when the tooltip speaks', () => {
  it('speaks off the rail and on a folded rail', () => {
    expect(tipWanted({ folded: false, row: false, more: false })).toBe(true);
    expect(tipWanted({ folded: true, row: true, more: false })).toBe(true);
  });

  it('keeps quiet on an unfolded row that only repeats its label', () => {
    expect(tipWanted({ folded: false, row: true, more: false })).toBe(false);
  });

  it('speaks on an unfolded row whose tip says more than its label', () => {
    expect(tipWanted({ folded: false, row: true, more: true })).toBe(true);
  });
});
