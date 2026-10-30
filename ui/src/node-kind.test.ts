import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePreset } from '../../src/core/preset.ts';
import { itemNodeKind, nodeKind } from './node-kind.ts';
import type { Closing, TypeView } from './types.ts';

const closedStatesOf = (preset: string) =>
  parsePreset(
    readFileSync(new URL(`../../presets/${preset}/preset.yaml`, import.meta.url), 'utf8'),
  ).workflow.states.filter(({ turn }) => turn === 'none');

describe('nodeKind', () => {
  const open = { turn: 'agent' as const, leased: false, incomplete: false };

  it('marks your turn as yours', () => {
    expect(nodeKind({ ...open, turn: 'human' })).toBe('you');
  });

  it('shows an agent at work while a lease is held', () => {
    expect(nodeKind({ ...open, leased: true })).toBe('working');
    expect(nodeKind({ ...open, incomplete: true, leased: true })).toBe('working');
  });

  it('shows an incomplete item nobody holds as incomplete', () => {
    expect(nodeKind({ ...open, incomplete: true })).toBe('incomplete');
  });

  it('shows an agent-turn item nobody holds as queued', () => {
    expect(nodeKind(open)).toBe('queued');
  });

  it('splits closed items by how their state closes them, whatever it is called', () => {
    const closed = (closes: Closing) => nodeKind({ ...open, turn: 'none', closes });

    expect(closed('done')).toBe('done');
    expect(closed('discarded')).toBe('discarded');
  });

  it('reads a closed item as done while its closing is unknown', () => {
    expect(nodeKind({ ...open, turn: 'none' })).toBe('done');
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
