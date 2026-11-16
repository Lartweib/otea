import { describe, expect, it } from 'vitest';
import { unopenedOf } from './phone-review.ts';

const ev = (id: number) => ({ id });

describe('unopenedOf: the files of the round the person has not opened yet', () => {
  it('counts what was not opened in the reader', () => {
    expect(unopenedOf([ev(1), ev(2), ev(3)], new Set([2]))).toEqual({ unopened: 2, total: 3 });
  });

  it('is nothing once every file was opened, or when there are none', () => {
    expect(unopenedOf([ev(1)], new Set([1]))).toEqual({ unopened: 0, total: 1 });
    expect(unopenedOf([], new Set())).toEqual({ unopened: 0, total: 0 });
  });
});
