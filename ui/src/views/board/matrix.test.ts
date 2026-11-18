import { describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { creatures } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Item } from '../../types.ts';
import {
  axesOf,
  byPriority,
  heatOf,
  matrixOf,
  orderedSaid,
  orderList,
  quadrantOf,
} from './matrix.ts';

function weighed(): BoardDefinition {
  const def = creatures();
  def.parts.feffort = {
    id: 'feffort',
    name: 'Esfuerzo',
    kind: 'choice',
    hint: '',
    options: [
      { id: 'cs', name: 'S' },
      { id: 'cm', name: 'M' },
      { id: 'cl', name: 'L' },
    ],
  };
  def.parts.frisk = { id: 'frisk', name: 'Riesgo', kind: 'level', hint: '', options: [] };
  def.parts.fcost = { id: 'fcost', name: 'Coste', kind: 'number', hint: '', options: [] };
  def.analysis = { effort: 'feffort', risk: 'frisk', impact: 'fcost' };
  return def;
}

const item = (id: string, fields: Record<string, string>, priority?: Item['priority']): Item =>
  ({ id, title: id, fields, ...(priority ? { priority } : {}) }) as Item;

describe('the analysis matrix', () => {
  it('lays items in cells by their two values, and keeps the unestimated aside', () => {
    const def = weighed();
    const items = [
      item('A', { feffort: 'cs', frisk: 'low' }),
      item('B', { feffort: 'cl', frisk: 'critical' }),
      item('C', { feffort: 'cm' }),
    ];
    const m = matrixOf(def, items, { x: 'effort', y: 'risk' });
    expect(m.xs.map(({ name }) => name)).toEqual(['S', 'M', 'L']);
    expect(m.ys.map(({ value }) => value)).toEqual(['low', 'medium', 'high', 'critical']);
    // The top row is the highest risk.
    expect(m.rows[0]?.[2]?.items.map(({ id }) => id)).toEqual(['B']);
    expect(m.rows[3]?.[0]?.items.map(({ id }) => id)).toEqual(['A']);
    expect(m.aside.map(({ id }) => id)).toEqual(['C']);
    expect(m.placed).toBe(2);
  });

  it('reads a number scale from the values items carry', () => {
    const m = matrixOf(
      weighed(),
      [item('A', { feffort: 'cs', fcost: '8' }), item('B', { feffort: 'cl', fcost: '3' })],
      { x: 'effort', y: 'impact' },
    );
    expect(m.ys.map(({ value }) => value)).toEqual(['3', '8']);
    expect(m.rows[0]?.[0]?.items.map(({ id }) => id)).toEqual(['A']);
  });

  it('warms a cell the higher it sits on both scales', () => {
    const m = matrixOf(weighed(), [], { x: 'effort', y: 'risk' });
    const corner = m.rows[0]?.[2];
    const origin = m.rows[3]?.[0];
    expect(corner && heatOf(m, corner)).toBe(4);
    expect(origin && heatOf(m, origin)).toBe(1);
  });

  it('keeps the axes picked while they are mapped and differ, else effort × risk', () => {
    const def = weighed();
    expect(axesOf(def)).toEqual({ x: 'effort', y: 'risk' });
    expect(axesOf(def, { x: 'impact', y: 'risk' })).toEqual({ x: 'impact', y: 'risk' });
    expect(axesOf(def, { x: 'risk', y: 'risk' })).toEqual({ x: 'risk', y: 'effort' });
    def.analysis = { effort: 'feffort' };
    expect(axesOf(def)).toBeUndefined();
  });

  it('orders pinned items first, then the fixed order', () => {
    const items = [item('A', {}, { rank: 2 }), item('B', {}), item('C', {}, { pin: 1 })];
    expect(byPriority(items).map(({ id }) => id)).toEqual(['C', 'A', 'B']);
    expect(orderList(items).map(({ id }) => id)).toEqual(['C', 'A']);
  });
});

describe('fixing the order', () => {
  it('says agents take it first, and that a step of yours still waits for you', () => {
    setLanguage('es');
    const items = [
      { ...item('A', {}), turn: 'agent' },
      { ...item('B', {}), turn: 'human' },
    ] as Item[];
    expect(orderedSaid(['A'], items)).toBe('Orden fijado: los agentes lo toman primero.');
    expect(orderedSaid(['A', 'B'], items)).toBe(
      'Orden fijado: los agentes toman estos 2 en este orden. 1 espera un paso tuyo: el orden no lo adelanta, lo haces tú cuando quieras.',
    );
    setLanguage('en');
  });
});

describe('the quadrants', () => {
  const cell = (x: number, y: number) => ({ x, y, items: [] });

  it('names effort × impact as quick wins, big bets, fill-ins and time sinks, either way round', () => {
    const def = weighed();
    const m = matrixOf(def, [], { x: 'effort', y: 'impact' });
    // impact on a number reads the values the items carry: give it four.
    const four = { ...m, xs: m.xs, ys: [0, 1, 2, 3].map((n) => ({ value: `${n}`, name: `${n}` })) };
    expect(quadrantOf(four, cell(0, 3))).toBe('quick');
    expect(quadrantOf(four, cell(2, 3))).toBe('big');
    expect(quadrantOf(four, cell(0, 0))).toBe('fill');
    expect(quadrantOf(four, cell(2, 0))).toBe('sink');
    // The middle of an odd scale is in no quadrant.
    expect(quadrantOf(four, cell(1, 3))).toBeUndefined();
    const turned = {
      ...four,
      axes: { x: 'impact', y: 'effort' } as const,
      xs: four.ys,
      ys: four.xs,
    };
    expect(quadrantOf(turned, cell(3, 0))).toBe('quick');
  });

  it('names effort × risk by how quick and how safe, and nothing else', () => {
    const def = weighed();
    const m = matrixOf(def, [], { x: 'effort', y: 'risk' });
    expect(quadrantOf(m, cell(0, 0))).toBe('quickSafe');
    expect(quadrantOf(m, cell(0, 3))).toBe('quickRisky');
    expect(quadrantOf(m, cell(2, 0))).toBe('slowSafe');
    expect(quadrantOf(m, cell(2, 3))).toBe('slowRisky');
    const other = { ...m, axes: { x: 'impact', y: 'risk' } as const };
    expect(quadrantOf(other, cell(0, 0))).toBeUndefined();
  });
});
