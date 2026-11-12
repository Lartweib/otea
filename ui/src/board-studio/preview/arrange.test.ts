import { describe, expect, it } from 'vitest';
import { clone, MOTIVE, STEP } from '../../../../src/core/board/model.ts';
import { cambios, creatures, errores } from '../../../../src/core/board/testing.ts';
import { groupOptions, moveTile, pageTiles, setListAs, setListGroup, zoneOf } from './arrange.ts';

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
    expect(refs(tiles.main)).toEqual([
      'fdesc',
      'eart',
      'eanim',
      'eswamp',
      'ecode',
      'fsteps',
      'rounds',
    ]);
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

describe('pageTiles row', () => {
  it('leaves out a column whose part nothing uses any more', () => {
    const def = creatures();
    def.form = def.form.filter(({ ref }) => ref !== 'fbiome');
    expect(refs(pageTiles(def, 'sanimate').row)).toEqual([]);
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

describe('pageTiles: Rondas and Partes', () => {
  it('shows Rondas on a board whose steps are reviewed, Principal by default, where Acomodar puts it', () => {
    const def = creatures();
    const tiles = pageTiles(def, 'sanimate');
    expect(tiles.main.at(-1)).toMatchObject({ ref: 'rounds', origin: { kind: 'place' } });
    moveTile(def, 'rounds', 'side');
    expect(refs(pageTiles(def, 'sanimate').side)).toContain('rounds');
    expect(def.layout.rounds).toBe('side');
    for (const step of def.steps) step.reviewer = 'none';
    expect(refs(pageTiles(def, 'sanimate').side)).not.toContain('rounds');
  });

  it('shows Partes only on a board that divides', () => {
    expect(refs(pageTiles(cambios(), 'sexec').main)).toContain('parts');
    expect(
      Object.values(pageTiles(creatures(), 'sanimate'))
        .flat()
        .map(({ ref }) => ref),
    ).not.toContain('parts');
  });
});

describe('list settings', () => {
  it('offers to group by a choice, level or yes-or-no field, Paso, and Motivo when there are motives', () => {
    const def = errores();
    expect(groupOptions(def)).toEqual([STEP, 'fcat', MOTIVE]);
    def.drop.motives = [];
    expect(groupOptions(def)).toEqual([STEP, 'fcat']);
  });

  it('writes the look and the grouping of the published list', () => {
    const def = errores();
    setListAs(def, 'table');
    setListGroup(def, 'fcat');
    expect(def.list).toEqual({ as: 'table', group: 'fcat' });
    setListGroup(def, undefined);
    expect(def.list).toEqual({ as: 'table' });
    setListAs(def, 'list');
    expect(def.list).toEqual({ as: 'list' });
  });
});
