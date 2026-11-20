import { describe, expect, it } from 'vitest';
import type { CollectionView } from '../types.ts';
import { boardEntries, railKey } from './rail-model.ts';

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
    expect(railKey({ view: 'performance' })).toBe('performance');
    expect(railKey({ view: 'topics' })).toBe('topics');
  });

  it('has none for the pages the rail does not list', () => {
    expect(railKey({ view: 'projects' })).toBe(null);
    expect(railKey({ view: 'triage' })).toBe(null);
    expect(railKey({ view: 'brief', ids: ['A'] })).toBe(null);
  });
});

describe('the rail’s boards', () => {
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
});
