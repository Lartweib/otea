import {
  defaultAxes,
  mappedScales,
  rolePart,
  type ScaleRole,
  type ScaleStep,
  scaleOf,
  stepOf,
} from '../../../../src/core/board/analysis.ts';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import type { Item } from '../../types.ts';

// The analysis matrix (approved mock, "Vistas de análisis"): a board's open items laid in a grid of
// cells, one scale role across and another up (effort × risk by default). Cells, not dots: the
// values are steps of a scale, and a scatter would invent distances. An item missing either value
// waits aside, never in a made-up cell.

export type Axes = { x: ScaleRole; y: ScaleRole };

export type MatrixCell = { x: number; y: number; items: Item[] };

export type Matrix = {
  axes: Axes;
  xs: ScaleStep[];
  ys: ScaleStep[];
  // Row-major from the top row (the highest y) down, each row left to right.
  rows: MatrixCell[][];
  aside: Item[];
  placed: number;
};

// The axes a person picked, kept only while both are still mapped and differ; else the default.
export function axesOf(def: BoardDefinition, picked: Partial<Axes> = {}): Axes | undefined {
  const scales = mappedScales(def);
  const fallback = defaultAxes(def);
  if (!fallback) return undefined;
  const x = picked.x && scales.includes(picked.x) ? picked.x : fallback.x;
  let y = picked.y && scales.includes(picked.y) ? picked.y : fallback.y;
  if (y === x) y = scales.find((role) => role !== x) ?? fallback.y;
  return { x, y };
}

export function matrixOf(def: BoardDefinition, items: readonly Item[], axes: Axes): Matrix {
  const px = rolePart(def, axes.x);
  const py = rolePart(def, axes.y);
  const valuesOf = (ref: string | undefined) =>
    ref === undefined ? [] : items.map((it) => it.fields[ref] ?? '');
  const xs = px ? scaleOf(px, valuesOf(px.id)) : [];
  const ys = py ? scaleOf(py, valuesOf(py.id)) : [];
  const grid = ys.map((_, y) => xs.map((_, x) => ({ x, y, items: [] as Item[] })));
  const aside: Item[] = [];
  let placed = 0;
  for (const item of items) {
    const x = stepOf(xs, px ? item.fields[px.id] : undefined);
    const y = stepOf(ys, py ? item.fields[py.id] : undefined);
    const cell = x === undefined || y === undefined ? undefined : grid[y]?.[x];
    if (cell) {
      cell.items.push(item);
      placed += 1;
    } else aside.push(item);
  }
  return { axes, xs, ys, rows: [...grid].reverse(), aside, placed };
}

// How warm a cell is, 1 (low across and up) to 4 (high on both): the more effort and risk, the
// warmer, as the mock tints it.
export function heatOf(m: Matrix, cell: MatrixCell): 1 | 2 | 3 | 4 {
  const span = Math.max(1, m.xs.length - 1 + (m.ys.length - 1));
  const share = (cell.x + cell.y) / span;
  return share < 0.25 ? 1 : share < 0.5 ? 2 : share < 0.8 ? 3 : 4;
}

// The quadrant a cell is in, named for what doing it is worth: on effort × impact the quick wins
// (little effort, high impact), the big bets, the fill-ins and the time sinks; on effort × risk how
// quick and how safe. Other pairs, and the middle of an odd scale, have none.
export type Quadrant =
  | 'quick'
  | 'big'
  | 'fill'
  | 'sink'
  | 'quickSafe'
  | 'quickRisky'
  | 'slowSafe'
  | 'slowRisky';

const EFFORT_BY: Readonly<
  Record<'impact' | 'risk', Record<'lowLow' | 'lowHigh' | 'highLow' | 'highHigh', Quadrant>>
> = {
  impact: { lowHigh: 'quick', highHigh: 'big', lowLow: 'fill', highLow: 'sink' },
  risk: { lowLow: 'quickSafe', lowHigh: 'quickRisky', highLow: 'slowSafe', highHigh: 'slowRisky' },
};

export function quadrantOf(
  m: Pick<Matrix, 'axes' | 'xs' | 'ys'>,
  cell: Pick<MatrixCell, 'x' | 'y'>,
): Quadrant | undefined {
  const half = (at: number, steps: number): 'low' | 'high' | undefined => {
    const mid = (steps - 1) / 2;
    return at < mid ? 'low' : at > mid ? 'high' : undefined;
  };
  const sides = { [m.axes.x]: half(cell.x, m.xs.length), [m.axes.y]: half(cell.y, m.ys.length) };
  const other = m.axes.x === 'effort' ? m.axes.y : m.axes.y === 'effort' ? m.axes.x : undefined;
  if (other !== 'impact' && other !== 'risk') return undefined;
  const effort = sides.effort;
  const them = sides[other];
  if (!effort || !them) return undefined;
  return EFFORT_BY[other][`${effort}${them === 'low' ? 'Low' : 'High'}`];
}

// The person's order on the matrix: what is on top (pinned, in the order pinned), then the fixed
// order, then the rest in the order given.
export function byPriority(items: readonly Item[]): Item[] {
  const key = (it: Item) => [
    it.priority?.pin ?? Number.POSITIVE_INFINITY,
    it.priority?.rank ?? Number.POSITIVE_INFINITY,
  ];
  return [...items].sort((a, b) => {
    const [pa, ra] = key(a) as [number, number];
    const [pb, rb] = key(b) as [number, number];
    return pa !== pb ? (pa < pb ? -1 : 1) : ra !== rb ? (ra < rb ? -1 : 1) : 0;
  });
}

// "Your order": the items with a place in the person's order, as next reads it.
export function orderList(items: readonly Item[]): Item[] {
  return byPriority(items.filter((it) => it.priority !== undefined));
}

// What «Fijar el orden» says it did: the order is what agents take first. A step that is yours to
// do or review now (turn human) waits for you whatever the order: said, never promised away.
export function orderedSaid(ids: readonly string[], items: readonly Item[]): string {
  const said = t('matrix.ordered', { count: ids.length });
  const yours = items.filter((it) => ids.includes(it.id) && it.turn === 'human').length;
  return yours > 0 ? `${said} ${t('matrix.orderedYours', { count: yours })}` : said;
}
