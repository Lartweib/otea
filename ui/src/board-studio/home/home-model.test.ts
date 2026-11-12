import { describe, expect, it } from 'vitest';
import type { BoardSummary } from '../api.ts';
import { arrivedDrafts, freeName, freshlyLive, nameIssue, statusOf } from './home-model.ts';

// What Studio's home decides without drawing: a board's status in words, a free name for a copy,
// the checks of a new board's name, the drafts an agent just delivered, and the boards the rail
// has not shown before.

const summary = (over: Partial<BoardSummary>): BoardSummary =>
  ({
    id: 'b1',
    name: 'Recursos',
    item: 'Criatura',
    icon: 'layers',
    builtin: false,
    status: 'live',
    liveVersion: 3,
    collection: 'Recursos',
    open: 0,
    requestItem: null,
    definition: {} as BoardSummary['definition'],
    ...over,
  }) as BoardSummary;

describe('a board’s status', () => {
  it('is its published version when nothing waits to be published', () => {
    expect(statusOf(summary({ status: 'live', liveVersion: 3 }))).toEqual({
      kind: 'live',
      version: 3,
    });
  });

  it('adds the unpublished changes to a published board', () => {
    expect(statusOf(summary({ status: 'changed', liveVersion: 2 }))).toEqual({
      kind: 'changed',
      version: 2,
    });
  });

  it('is a draft before its first publish', () => {
    expect(statusOf(summary({ status: 'draft', liveVersion: null }))).toEqual({ kind: 'draft' });
  });

  it('names the agent drafting it, when it is known', () => {
    expect(statusOf(summary({ status: 'waiting' }), 'kiln')).toEqual({
      kind: 'waiting',
      agent: 'kiln',
    });
    expect(statusOf(summary({ status: 'waiting' }))).toEqual({ kind: 'waiting', agent: null });
  });
});

describe('a free name', () => {
  it('is the name itself while no board has it, whatever the case', () => {
    expect(freeName('Recursos de juego', ['Errores'])).toBe('Recursos de juego');
  });

  it('counts up past the names taken', () => {
    expect(freeName('Bugs', ['bugs', 'Bugs 2'])).toBe('Bugs 3');
  });
});

describe('a new board’s name', () => {
  it('needs some text', () => {
    expect(nameIssue('   ', [])).toBe('empty');
  });

  it('is taken when a board has it already, whatever the case and spacing', () => {
    expect(nameIssue('  criaturas   del pantano ', ['Criaturas del pantano'])).toBe('taken');
  });

  it('is fine otherwise', () => {
    expect(nameIssue('Criaturas', ['Errores'])).toBeNull();
  });
});

describe('drafts that arrive', () => {
  it('are the boards that waited for an agent and no longer do', () => {
    const before = [
      summary({ id: 'a', status: 'waiting' }),
      summary({ id: 'b', status: 'waiting' }),
    ];
    const after = [summary({ id: 'a', status: 'draft' }), summary({ id: 'b', status: 'waiting' })];

    expect(arrivedDrafts(before, after).map((b) => b.id)).toEqual(['a']);
  });

  it('are none on the first read', () => {
    expect(arrivedDrafts(null, [summary({ status: 'draft' })])).toEqual([]);
  });
});

describe('boards published since the last read', () => {
  it('are the collections of boards live now that were not live before', () => {
    const before = [
      summary({ id: 'a', status: 'draft', collection: null }),
      summary({ id: 'b', status: 'live', collection: 'Errores' }),
    ];
    const after = [
      summary({ id: 'a', status: 'live', collection: 'Criaturas' }),
      summary({ id: 'b', status: 'changed', collection: 'Errores' }),
      summary({ id: 'c', status: 'live', collection: 'Notas' }),
    ];

    expect(freshlyLive(before, after)).toEqual(['Criaturas', 'Notas']);
  });

  it('are none on the first read', () => {
    expect(freshlyLive(null, [summary({ status: 'live' })])).toEqual([]);
  });
});
