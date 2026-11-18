import { describe, expect, it } from 'vitest';
import { prState } from './gh.ts';

describe('prState', () => {
  it('says nothing when gh is missing or cannot read the PR', () => {
    expect(prState(process.cwd(), '482', 'otea-no-such-gh')).toBeUndefined();
    expect(prState(process.cwd(), '482', undefined)).toBeUndefined();
  });
});
