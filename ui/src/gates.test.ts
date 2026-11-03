import { describe, expect, it } from 'vitest';
import { externalUrl, gateRows, waitingOnYou } from './gates.ts';
import type { Move, TypeView } from './types.ts';

const repoTask = {
  name: 'repo_task',
  label: 'Repo task',
  initial: 'proposed',
  states: [],
  fields: [],
  layout: { header: [], evidence: [], body: [], side: [], row: [], phone: [], intake: [] },
  gates: { push: ['implementing', 'revising'], merge: ['approved'] },
} as TypeView;

const move = (to: string, by: Move['by']): Move => ({
  to,
  by,
  reasonRequired: false,
  turn: 'agent',
});

describe('gateRows', () => {
  it('reads each gated action from the state, with the states that allow it', () => {
    expect(gateRows(repoTask, 'implementing')).toEqual([
      { action: 'push', allowed: true, states: ['implementing', 'revising'] },
      { action: 'merge', allowed: false, states: ['approved'] },
    ]);
    expect(gateRows(repoTask, 'approved').map(({ allowed }) => allowed)).toEqual([false, true]);
  });

  it('takes the verdicts the server sent over its own reading', () => {
    expect(gateRows(repoTask, 'proposed', { push: true, merge: false })[0]?.allowed).toBe(true);
  });

  it('has no rows for a type without gates', () => {
    expect(gateRows({ ...repoTask, gates: undefined } as unknown as TypeView, 'x')).toEqual([]);
    expect(gateRows(undefined, 'x')).toEqual([]);
  });
});

describe('waitingOnYou', () => {
  it('names a refused action that one of your moves would allow', () => {
    const rows = gateRows(repoTask, 'pr_review');

    const revising = { ...move('revising', 'human'), reasonRequired: true };

    expect(waitingOnYou(rows, [move('approved', 'human-ui'), revising])).toEqual(['merge']);
  });

  it('names nothing when only an agent move would allow it', () => {
    const rows = gateRows(repoTask, 'ready');

    expect(waitingOnYou(rows, [move('implementing', 'agent')])).toEqual([]);
  });
});

describe('externalUrl', () => {
  it('links a web address and leaves anything else as text', () => {
    expect(externalUrl('https://github.com/acme/api/pull/482')).toBe(
      'https://github.com/acme/api/pull/482',
    );
    expect(externalUrl('#482')).toBeUndefined();
    expect(externalUrl('javascript:alert(1)')).toBeUndefined();
  });
});
