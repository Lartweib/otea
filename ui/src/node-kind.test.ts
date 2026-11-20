import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePreset } from '../../src/core/preset.ts';
import { type NodeFacts, type NodeKind, nodeKind } from './node-kind.ts';

const closedStatesOf = (preset: string) =>
  parsePreset(
    readFileSync(new URL(`../../presets/${preset}/preset.yaml`, import.meta.url), 'utf8'),
  ).workflow.states.filter(({ turn }) => turn === 'none');

describe('nodeKind', () => {
  const open = { turn: 'agent' as const, leased: false, incomplete: false };

  // Your turn is yours; an agent at work while a lease is held; an item nobody holds is incomplete
  // or queued; a closed item reads how its state closes it, whatever it is called, and as done
  // while its closing is unknown.
  it.each<[Partial<NodeFacts>, NodeKind]>([
    [{ turn: 'human' }, 'you'],
    [{ leased: true }, 'working'],
    [{ incomplete: true, leased: true }, 'working'],
    [{ incomplete: true }, 'incomplete'],
    [{}, 'queued'],
    [{ turn: 'none', closes: 'done' }, 'done'],
    [{ turn: 'none', closes: 'discarded' }, 'discarded'],
    [{ turn: 'none' }, 'done'],
  ])('reads %o as %s', (facts, kind) => {
    expect(nodeKind({ ...open, ...facts })).toBe(kind);
  });
});

describe('closed states of the official presets', () => {
  const kinds = (preset: string) =>
    Object.fromEntries(
      closedStatesOf(preset).map(({ name, closes }) => [
        name,
        nodeKind({ turn: 'none', leased: false, incomplete: false, ...(closes ? { closes } : {}) }),
      ]),
    );

  it('reads a fixed bug as done and the other closed bugs as discarded', () => {
    expect(kinds('bug-triage')).toEqual({
      fixed: 'done',
      rejected: 'discarded',
      duplicate: 'discarded',
      wont_fix: 'discarded',
    });
  });

  it('reads a done task as done and a discarded one as discarded', () => {
    expect(kinds('tasks')).toEqual({ done: 'done', discarded: 'discarded' });
  });
});
