import { describe, expect, it } from 'vitest';
import { laneParams } from './geometry.ts';
import { type BlockSnap, liteState, type Snap, virtSink } from './handoff.ts';

const ov = laneParams([], 400, 600);

const snapOf = (st: Snap['st']): Snap => ({ m: new Map(), ov, st });
const block = (o: Partial<BlockSnap> = {}): BlockSnap => ({
  el: {} as HTMLElement,
  top: 120,
  h: 50,
  w: 600,
  row: true,
  lane: 'ag',
  look: 'working',
  sec: 'encamino',
  off: 19.5,
  ny: 139.5,
  ...o,
});

describe('the virtual ends of a list that sinks', () => {
  it('sends an item that closed into the trunk, where the lanes fuse', () => {
    const B = snapOf({ A: { h: 'none', look: 'done', closed: true } });
    expect(virtSink(B, 'A', block())).toMatchObject({
      virtual: true,
      top: ov.fuseAt - 19.5,
      ny: ov.fuseAt,
      lane: 'none',
      look: 'done',
      sec: '__trunk',
      dropped: false,
    });
  });

  it('strikes a discarded one through', () => {
    const B = snapOf({ A: { h: 'none', look: 'dropped', closed: true } });
    expect(virtSink(B, 'A', block())?.dropped).toBe(true);
  });

  it('has no virtual end for an item still open, or unknown', () => {
    expect(virtSink(snapOf({ A: { h: 'ag', look: 'queued', closed: false } }), 'A', block())).toBe(
      null,
    );
    expect(virtSink(snapOf({}), 'A', block())).toBeNull();
  });

  it('reads every item’s lane, look and closing from the list’s universe', () => {
    const universe = new Map([
      ['A', { lane: 'you' as const, look: 'yours' as const, closed: false }],
      ['B', { lane: 'none' as const, look: 'dropped' as const, closed: true }],
    ]);
    expect(liteState(universe)).toEqual({
      A: { h: 'you', look: 'yours', closed: false },
      B: { h: 'none', look: 'dropped', closed: true },
    });
    expect(liteState(undefined)).toEqual({});
  });
});
