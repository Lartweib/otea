import { describe, expect, it } from 'vitest';
import { item } from '../derive/fixtures.ts';
import type { CollectionView } from '../types.ts';
import { boardEntries, foldClip, railKey } from './rail-model.ts';

const board = (name: string, icon: string | null = null) =>
  ({ name, icon, types: [] }) as unknown as CollectionView;

describe('the rail’s current row', () => {
  it('follows the view, the pairing dialog over Te toca, Studio for the module catalog', () => {
    expect(railKey({ view: 'toca', item: 'A' })).toBe('toca');
    expect(railKey({ view: 'lan' })).toBe('toca');
    expect(railKey({ view: 'atasco' })).toBe('atasco');
    expect(railKey({ view: 'board', board: 'Errores', item: 'ERR-1' })).toBe('board:Errores');
    expect(railKey({ view: 'studio', page: { kind: 'boards' } })).toBe('studio');
    expect(railKey({ view: 'modules' })).toBe('studio');
    expect(railKey({ view: 'settings' })).toBe('settings');
  });

  it('has none for the pages the rail does not list', () => {
    expect(railKey({ view: 'projects' })).toBe(null);
    expect(railKey({ view: 'triage' })).toBe(null);
    expect(railKey({ view: 'brief', ids: ['A'] })).toBe(null);
  });
});

describe('the rail’s boards', () => {
  const items = [
    item({ id: 'E1', collection: 'Errores', turn: 'human' }),
    item({ id: 'E2', collection: 'Errores', turn: 'agent' }),
    item({ id: 'E3', collection: 'Errores', turn: 'none' }),
    item({ id: 'C1', collection: 'Criaturas', turn: 'agent' }),
  ];

  it('counts yours over open on each board', () => {
    expect(
      boardEntries([board('Errores', 'bug'), board('Criaturas', 'paw')], items).map((b) => [
        b.name,
        b.yours,
        b.open,
      ]),
    ).toEqual([
      ['Errores', 1, 2],
      ['Criaturas', 0, 1],
    ]);
  });

  it('draws the mock’s icon when it has one, the catalog’s otherwise, a board when none', () => {
    const icons = boardEntries(
      [board('Errores', 'bug'), board('Mapas', 'mountain'), board('Sueltos', null)],
      [],
    ).map((b) => b.icon);
    expect(icons).toEqual([
      { kind: 'mock', name: 'bug' },
      { kind: 'type', name: 'mountain' },
      { kind: 'mock', name: 'board' },
    ]);
  });

  it('marks a board that repeats an earlier one’s icon with a letter', () => {
    const entries = boardEntries([board('bugs', 'bug'), board('bugs-mobile', 'bug')], []);
    expect(entries.map((b) => b.letter)).toEqual([undefined, 'm']);
  });
});

describe('the fold', () => {
  it('clips the rail to its 44 px icon strip, and opens it whole', () => {
    expect(foldClip(true)).toBe('inset(-8px 184px -8px -8px)');
    expect(foldClip(false)).toBe('inset(-8px -8px -8px -8px)');
  });
});
