import { afterEach, describe, expect, it } from 'vitest';
import { STEP } from '../../../../src/core/board/model.ts';
import { errores } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { sampleItems } from './samples.ts';
import { tableOf } from './table.ts';

afterEach(() => setLanguage('en'));

describe('sampleItems with motives', () => {
  it('adds a discarded sample with one of the board’s motives', () => {
    const items = sampleItems(errores());
    expect(items.at(-1)).toMatchObject({ closed: true, look: 'dropped', motive: 'Duplicado' });
    expect(items.at(-2)).toMatchObject({ closed: true, look: 'done' });
  });
});

describe('tableOf', () => {
  it('groups the rows by a field, which is never a column too', () => {
    setLanguage('es');
    const def = errores();
    def.row = ['fcat', 'frepo', 'fsteps'];
    def.list = { as: 'table', group: 'fcat' };
    const table = tableOf(def, sampleItems(def));
    expect(table.columns.map(({ id }) => id)).toEqual(['frepo', 'fsteps']);
    expect(table.groups.map(({ key }) => key)).toEqual(['Juego']);
    expect(table.groups[0]?.rows).toHaveLength(sampleItems(def).length);
  });

  it('groups by step, and an ended item shows only its motive or a dash under Turno', () => {
    setLanguage('es');
    const def = errores();
    def.list = { as: 'table', group: STEP };
    const table = tableOf(def, sampleItems(def));
    expect(table.groups.map(({ key }) => key)).toEqual([
      'Completar',
      'Triar',
      'Arreglar',
      'Hecho',
      'Descartado',
    ]);
    const ended = table.groups.slice(-2).map(({ rows }) => rows[0]?.turn);
    expect(ended).toEqual(['—', 'Duplicado']);
  });

  it('has one group with no head when nothing groups it', () => {
    const def = errores();
    def.list = { as: 'table' };
    const table = tableOf(def, sampleItems(def));
    expect(table.groups).toEqual([expect.objectContaining({ key: null })]);
  });
});
