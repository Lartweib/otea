import { describe, expect, it } from 'vitest';
import { clone } from '../../../../src/core/board/model.ts';
import { creatures } from '../../../../src/core/board/testing.ts';
import { moveTile, pageTiles, zoneOf } from './arrange.ts';

const refs = (tiles: { ref: string }[]) => tiles.map(({ ref }) => ref);

describe('zoneOf', () => {
  it('reads the layout, else the kind’s default place', () => {
    const def = creatures();
    expect(zoneOf(def, 'fbiome')).toBe('side');
    expect(zoneOf(def, 'eswamp')).toBe('main');
    expect(zoneOf(def, 'fsteps')).toBe('main');
  });
});

describe('pageTiles', () => {
  it('lays what the item has at a step in the zones, the list row apart', () => {
    const tiles = pageTiles(creatures(), 'sanimate');
    expect(refs(tiles.top)).toEqual([]);
    expect(refs(tiles.main)).toEqual(['fdesc', 'eart', 'eanim', 'eswamp', 'ecode', 'fsteps']);
    expect(refs(tiles.side)).toEqual(['fbiome']);
    expect(refs(tiles.row)).toEqual(['fbiome']);
    expect(tiles.main.find(({ ref }) => ref === 'eanim')).toMatchObject({
      origin: { kind: 'step', step: 'sanimate' },
      now: true,
    });
    expect(tiles.main[0]).toMatchObject({ origin: { kind: 'form' }, now: false });
    expect(tiles.row[0]).toMatchObject({ column: true });
  });
});

describe('moveTile', () => {
  it('moves a box to a zone, at the end or before another, keeping the key order as the tile order', () => {
    const def = creatures();
    moveTile(def, 'fbiome', 'main', 'eart');
    expect(refs(pageTiles(def, 'sanimate').main).slice(0, 3)).toEqual(['fdesc', 'fbiome', 'eart']);
    moveTile(def, 'fdesc', 'hidden');
    expect(def.layout.fdesc).toBe('hidden');
    expect(refs(pageTiles(def, 'sanimate').hidden)).toEqual(['fdesc']);
  });

  it('adds a column to the list row without moving the box, and takes it off again', () => {
    const def = creatures();
    moveTile(def, 'fdesc', 'row');
    expect(def.row).toEqual(['fbiome', 'fdesc']);
    expect(zoneOf(def, 'fdesc')).toBe('main');
    moveTile(def, 'fdesc', 'row', 'fbiome');
    expect(def.row).toEqual(['fdesc', 'fbiome']);
    moveTile(def, 'fdesc', 'unrow');
    expect(def.row).toEqual(['fbiome']);
  });

  it('takes a column out of the row when it is dragged from there to a zone', () => {
    const def = creatures();
    moveTile(def, 'fbiome', 'hidden', undefined, { fromRow: true });
    expect(def.row).toEqual([]);
    expect(def.layout.fbiome).toBe('hidden');
  });

  it('never touches what a step asks for', () => {
    const def = creatures();
    const before = clone(def.steps);
    moveTile(def, 'eanim', 'hidden');
    expect(def.steps).toEqual(before);
  });
});
