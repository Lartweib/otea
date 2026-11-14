import { describe, expect, it } from 'vitest';
import type { ArchivedBoard } from '../api.ts';
import { archivedMatches, nameTyped } from './archive.ts';

const board = (name: string, entries: [string, string][], parent: string | null = null) =>
  ({
    id: `b-${name}`,
    name,
    item: 'Ítem',
    icon: 'paw',
    collection: name,
    archivedAt: '2026-11-14T09:00:00.000Z',
    items: entries.length,
    open: entries.length,
    parent,
    entries: entries.map(([id, title]) => ({
      id,
      title,
      state: 's1__doing',
      stateName: 'Hacerlo',
      review: false,
      closed: false,
    })),
  }) satisfies ArchivedBoard;

const criaturas = board('Criaturas', [
  ['CRI-1', 'Ciervo del pantano'],
  ['CRI-2', 'Tortuga musgosa'],
]);
const plantas = board('Plantas', [['PLA-1', 'Rosa']]);

describe('archivedMatches', () => {
  it('shows every archived board and all its items with no search', () => {
    expect(archivedMatches([criaturas, plantas], '  ')).toEqual([
      { board: criaturas, entries: criaturas.entries },
      { board: plantas, entries: plantas.entries },
    ]);
  });

  it('finds items by title or id, whatever the case and accents', () => {
    const found = archivedMatches([criaturas, plantas], 'TORTUGA');
    expect(found.map(({ board: b, entries }) => [b.name, entries.map(({ id }) => id)])).toEqual([
      ['Criaturas', ['CRI-2']],
    ]);
    expect(archivedMatches([criaturas, plantas], 'pla-1')[0]?.entries[0]?.id).toBe('PLA-1');
    expect(archivedMatches([criaturas], 'ciervo del')[0]?.entries).toHaveLength(1);
    expect(archivedMatches([criaturas], 'pantáno')[0]?.entries).toHaveLength(1);
  });

  it('keeps a board whose name matches with all its items', () => {
    expect(archivedMatches([criaturas, plantas], 'plantas')).toEqual([
      { board: plantas, entries: plantas.entries },
    ]);
  });

  it('finds nothing when nothing matches', () => {
    expect(archivedMatches([criaturas, plantas], 'dragón')).toEqual([]);
  });
});

describe('nameTyped', () => {
  it('takes the board’s name as typed, in any case, spaces around it aside', () => {
    expect(nameTyped('Criaturas', ' criaturas ')).toBe(true);
    expect(nameTyped('Criaturas', 'Criatura')).toBe(false);
    expect(nameTyped('Criaturas', '')).toBe(false);
  });
});
