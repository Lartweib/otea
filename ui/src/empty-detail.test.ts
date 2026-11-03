import { describe, expect, it } from 'vitest';
import { emptyFacts } from './empty-detail.ts';
import type { Turn } from './types.ts';

const turns = (...list: Turn[]) => list.map((turn) => ({ turn }));

describe('emptyFacts', () => {
  it('counts what waits for you and what agents hold', () => {
    expect(emptyFacts(turns('human', 'agent', 'human', 'none', 'agent', 'agent'))).toEqual([
      { kind: 'yours', count: 2 },
      { kind: 'agents', count: 3 },
    ]);
  });

  it('says nothing waits for you when nothing does', () => {
    expect(emptyFacts(turns('agent', 'none'))).toEqual([
      { kind: 'nothing' },
      { kind: 'agents', count: 1 },
    ]);
  });

  it('leaves out the agents when they hold nothing', () => {
    expect(emptyFacts(turns('human', 'none'))).toEqual([{ kind: 'yours', count: 1 }]);
    expect(emptyFacts(turns('none'))).toEqual([{ kind: 'nothing' }]);
  });
});
