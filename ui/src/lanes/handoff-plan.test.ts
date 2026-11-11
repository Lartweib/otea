import { describe, expect, it } from 'vitest';
import { laneParams } from './geometry.ts';
import { planHandoff } from './handoff-plan.ts';
import type { BlockSnap, LiteState, Snap } from './handoff-snap.ts';

// The handoff sorts every block of a list from two snapshots (before, after): carried (it changed
// lane or section, or came from or went to a virtual end), room (same section, new height), enter,
// leave, and restyle (a look change in place).

const el = (k: string) => ({ k }) as unknown as HTMLElement;
const els = new Map<string, HTMLElement>();
const elOf = (k: string) => {
  if (!els.has(k)) els.set(k, el(k));
  return els.get(k) as HTMLElement;
};

const row = (k: string, top: number, o: Partial<BlockSnap> = {}): [string, BlockSnap] => [
  k,
  {
    el: elOf(k),
    top,
    h: 50,
    w: 700,
    row: true,
    lane: 'you',
    look: 'yours',
    sec: 'revisiones',
    off: 19.5,
    ny: top + 19.5,
    ...o,
  },
];
const sec = (k: string, top: number, n = '1'): [string, BlockSnap] => [
  k,
  { el: elOf(k), top, h: 40, w: 700, n },
];

const snapOf = (blocks: [string, BlockSnap][], st: LiteState = {}, H = 600): Snap => ({
  m: new Map(blocks),
  ov: laneParams([], H, 700),
  st,
});

describe('planHandoff', () => {
  it('carries a row that changes lane, and makes room for the ones that only move', () => {
    const A = snapOf([sec('sec:rev', 0), row('A', 40), row('B', 90), sec('sec:enc', 140)]);
    const B = snapOf([
      sec('sec:rev', 0),
      row('B', 40),
      sec('sec:enc', 90),
      row('A', 130, { lane: 'ag', look: 'working', sec: 'encamino' }),
    ]);
    const p = planHandoff(A, B, { sink: true });
    expect(p.carried.map((c) => [c.k, c.pre.lane, c.post.lane, c.cur, c.ct, c.gone])).toEqual([
      ['A', 'you', 'ag', 'ag', 130, false],
    ]);
    expect(p.rooms.map((r) => [r.k, r.dy])).toEqual([
      ['B', 50],
      ['sec:enc', 50],
    ]);
    expect(p.enters).toEqual([]);
    expect(p.leaves).toEqual([]);
  });

  it('carries a row that changes section on the same lane', () => {
    const A = snapOf([row('A', 40, { sec: 'preguntas' })]);
    const B = snapOf([row('A', 120, { sec: 'revisiones' })]);
    expect(planHandoff(A, B, { sink: false }).carried.map((c) => c.k)).toEqual(['A']);
  });

  it('restyles a look change in place', () => {
    const A = snapOf([row('A', 40, { lane: 'ag', look: 'stuck', sec: 'atasco' })]);
    const B = snapOf([row('A', 40, { lane: 'ag', look: 'working', sec: 'atasco' })]);
    const p = planHandoff(A, B, { sink: true });
    expect(p.carried).toEqual([]);
    expect(p.rooms).toEqual([]);
    expect(p.restyles.map((r) => [r.k, r.pre.look, r.post.look])).toEqual([
      ['A', 'stuck', 'working'],
    ]);
  });

  it('enters a new block and leaves a gone one', () => {
    const A = snapOf([sec('sec:a', 0), row('A', 40)]);
    const B = snapOf([
      sec('sec:a', 0, '0'),
      ['empty:a', { el: elOf('empty:a'), top: 40, h: 30, w: 700 }],
    ]);
    const p = planHandoff(A, B, { sink: false });
    expect(p.enters.map((e) => e.k)).toEqual(['empty:a']);
    expect(p.leaves.map((e) => [e.k, e.top, e.w])).toEqual([['A', 40, 700]]);
  });

  it('sinks a row whose item closed into the trunk, in a list that sinks', () => {
    const A = snapOf([row('A', 40)], { A: { h: 'you', look: 'yours', closed: false } });
    const B = snapOf([], { A: { h: 'none', look: 'done', closed: true } }, 300);
    const p = planHandoff(A, B, { sink: true });
    expect(p.leaves).toEqual([]);
    const [c] = p.carried;
    expect(c).toMatchObject({ k: 'A', gone: true, ct: 40, cur: 'you' });
    expect(c?.post).toMatchObject({ virtual: true, lane: 'none', ny: B.ov.fuseAt, sec: '__trunk' });
    // Without the sink it only leaves.
    expect(planHandoff(A, B, { sink: false }).leaves.map((l) => l.k)).toEqual(['A']);
  });

  it('brings a row back out of the trunk when its item reopens', () => {
    const A = snapOf([], { A: { h: 'none', look: 'done', closed: true } }, 300);
    const B = snapOf([row('A', 40)], { A: { h: 'you', look: 'yours', closed: false } });
    const [c] = planHandoff(A, B, { sink: true }).carried;
    expect(c?.pre).toMatchObject({ virtual: true, lane: 'none', ny: A.ov.fuseAt });
    expect(c?.post.lane).toBe('you');
  });

  it('brings a row handed to you out of the agents lane, at its own height', () => {
    const A = snapOf([], { A: { h: 'ag', look: 'working', closed: false } });
    const B = snapOf([row('A', 80)], { A: { h: 'you', look: 'yours', closed: false } });
    const [c] = planHandoff(A, B, { sink: false }).carried;
    expect(c?.pre).toMatchObject({
      virtual: true,
      arrive: true,
      lane: 'ag',
      look: 'working',
      top: 80,
    });
    // An item nobody had before simply enters.
    const fresh = planHandoff(snapOf([]), B, { sink: false });
    expect(fresh.carried).toEqual([]);
    expect(fresh.enters.map((e) => e.k)).toEqual(['A']);
  });

  it('forces an arrival when told so', () => {
    const B = snapOf([row('A', 80)]);
    const [c] = planHandoff(snapOf([]), B, { sink: false, arrive: true }).carried;
    expect(c?.pre).toMatchObject({ arrive: true, lane: 'ag', look: 'working' });
  });
});
