import { describe, expect, it } from 'vitest';
import type { TypeView } from '../types.ts';
import { officialType } from './fixtures.ts';
import { mainPath, pathStep } from './path.ts';

describe("a type's main path", () => {
  it('walks bug-triage from where it starts to where it is done', () => {
    expect(mainPath(officialType('bug-triage'))).toEqual([
      'reported',
      'accepted',
      'fixing',
      'verify',
      'fixed',
    ]);
  });

  it('walks architecture to its accepted decision', () => {
    expect(mainPath(officialType('architecture'))).toEqual(['drafting', 'review', 'accepted']);
  });

  it('follows the states in their order when the server sends no moves', () => {
    const type = { ...officialType('architecture') } as TypeView;
    delete type.transitions;
    expect(mainPath(type)).toEqual(['drafting', 'review', 'revising', 'accepted']);
  });
});

describe('where an off-path state sits on the path', () => {
  const arch = officialType('architecture');
  const bug = officialType('bug-triage');

  it('puts a state of the path at its own step', () => {
    expect(pathStep(arch, 'review')).toBe(1);
    expect(pathStep(bug, 'fixed')).toBe(4);
  });

  it('puts an off-path state at the nearest earlier step with the same turn', () => {
    expect(pathStep(arch, 'revising')).toBe(0);
  });

  it('else at the latest step of the path the item visited', () => {
    expect(pathStep(bug, 'needs_info', ['reported'])).toBe(0);
    expect(pathStep(bug, 'wont_fix', ['reported', 'accepted', 'fixing'])).toBe(2);
    expect(pathStep(bug, 'rejected')).toBe(0);
  });
});
