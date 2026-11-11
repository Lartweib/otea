import { beforeEach, describe, expect, it } from 'vitest';
import { officialType } from '../../derive/fixtures.ts';
import { availableColumns, chosenColumns } from '../../grid.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { CollectionView } from '../../types.ts';
import { cellClass, headLabel, resizedWidth, tableLayout, widthChip } from './table.ts';

const bugs: CollectionView = {
  name: 'Errores',
  prefix: 'ERR',
  preset: 'bug-triage',
  icon: 'bug',
  types: [officialType('bug-triage')],
  view: {
    kind: 'grid',
    groupBy: 'turn',
    columns: ['id', 'title', 'state', 'severity', 'category', 'area', 'who', 'age'],
  },
};
const cols = chosenColumns(bugs);

beforeEach(() => setLanguage('es'));

describe('the table layout', () => {
  it('fits every chosen column in a wide room, the select box first, air after the title', () => {
    const l = tableLayout(cols, 1180, {});
    expect(l.shown).toEqual(['id', 'title', 'state', 'severity', 'category', 'area', 'who', 'age']);
    expect(l.hidden).toEqual([]);
    expect(l.tracks.startsWith('28px ')).toBe(true);
    expect(l.tracks).toContain('minmax(0, 1fr)');
    expect(l.sevbars).toBe(false);
  });

  it('drops fields from the last as the room narrows, the title never under 240', () => {
    const l = tableLayout(cols, 820, {});
    expect(l.hidden).toContain('area');
    expect(l.shown).toContain('title');
    expect(l.title).toBeGreaterThanOrEqual(240);
  });

  it('shows severity as bars alone when it is narrow', () => {
    expect(tableLayout(cols, 1180, { severity: 60 }).sevbars).toBe(true);
  });

  it('holds the air it is given while a column is dragged', () => {
    expect(tableLayout(cols, 2000, {}, 40).air).toBe(40);
  });
});

describe('the heads and cells', () => {
  it('names the built-in columns as the mock does, fields by their word in lower case', () => {
    const byKey = Object.fromEntries(availableColumns(bugs).map((c) => [c.key, headLabel(c)]));
    expect(byKey).toMatchObject({
      id: 'id',
      title: 'ítem',
      state: 'paso',
      severity: 'severidad',
      who: 'quién',
      age: 'edad',
    });
  });

  it('gives each column a class its cells and head share', () => {
    expect(cellClass('severity')).toBe('c-severity');
    expect(cellClass('my field')).toBe('c-my_field');
  });
});

describe('resizing a column by the edge that faces the title', () => {
  it('widens a column after the title as its left edge goes left, within its limits', () => {
    const state = cols.find((c) => c.key === 'state');
    if (!state) throw new Error('no state column');
    expect(resizedWidth(state, 120, -30, { min: 64, max: 300 })).toBe(150);
    expect(resizedWidth(state, 120, 200, { min: 64, max: 300 })).toBe(64);
    expect(resizedWidth(state, 120, -400, { min: 64, max: 300 })).toBe(300);
  });

  it('says the width on the chip, or min and max at the ends', () => {
    expect(widthChip('paso', 150, { min: 64, max: 300 })).toBe('paso · 150');
    expect(widthChip('paso', 64, { min: 64, max: 300 })).toBe('paso · mín');
    expect(widthChip('paso', 300, { min: 64, max: 300 })).toBe('paso · máx');
  });
});
