import { describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { creatures } from '../../../../src/core/board/testing.ts';
import type { Item } from '../../types.ts';
import { axesOf, byPriority, heatOf, matrixOf, orderList } from './matrix.ts';

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
