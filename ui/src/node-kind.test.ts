import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePreset } from '../../src/core/preset.ts';
import { itemNodeKind, type NodeFacts, type NodeKind, nodeKind } from './node-kind.ts';
import type { TypeView } from './types.ts';

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

describe('itemNodeKind', () => {
  const type = { incomplete: 'draft' } as TypeView;

  it('draws a closed item from its closes, so shipped is done and parked is discarded', () => {
    expect(itemNodeKind({ turn: 'none', state: 'shipped', closes: 'done' }, type, false)).toBe(
      'done',
    );
    expect(itemNodeKind({ turn: 'none', state: 'parked', closes: 'discarded' }, type, false)).toBe(
      'discarded',
    );
    expect(itemNodeKind({ turn: 'none', state: 'rejected', closes: 'done' }, type, false)).toBe(
      'done',
    );
  });

  it('reads the incomplete state from the item type', () => {
    expect(itemNodeKind({ turn: 'agent', state: 'draft' }, type, false)).toBe('incomplete');
    expect(itemNodeKind({ turn: 'agent', state: 'draft' }, undefined, false)).toBe('queued');
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
