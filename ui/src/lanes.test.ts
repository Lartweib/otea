import { describe, expect, it } from 'vitest';
import { branchPieces, LANE, laneX, layoutLanes, type TreeRow } from './lanes.ts';

describe('laneX', () => {
  it('puts your turn on the right lane, agents on the left and closed items on the trunk', () => {
    expect(laneX('human')).toBe(LANE.you);
    expect(laneX('agent')).toBe(LANE.agent);
    expect(laneX('none')).toBe(LANE.trunk);
    expect([LANE.agent, LANE.trunk, LANE.you]).toEqual([16, 28, 40]);
  });
});

describe('layoutLanes', () => {
  it('stacks blocks and centres each row node on its block', () => {
    const layout = layoutLanes([
      { height: 40 },
      { height: 56, turn: 'human' },
      { height: 56, turn: 'agent' },
    ]);

    expect(layout.height).toBe(152);
    expect(layout.rows).toEqual([
      { y: 68, x: 40 },
      { y: 124, x: 16 },
    ]);
  });

  it('runs both lanes down to the last open row and fuses them into the trunk at the first closed row', () => {
    const layout = layoutLanes([
      { height: 56, turn: 'human' },
      { height: 56, turn: 'agent' },
      { height: 40 },
      { height: 56, turn: 'none' },
      { height: 56, turn: 'none' },
    ]);
    // last open centre 84, first closed centre 180, mid 132
    expect(layout.agentLane).toBe('M16 0 V84 C16 132 28 132 28 180');
    expect(layout.youLane).toBe('M40 0 V84 C40 132 28 132 28 180');
    expect(layout.trunk).toBe('M28 180 V264');
  });

  it('fuses at the bottom when nothing is closed, so the lanes never end in a broken Y', () => {
    const layout = layoutLanes([{ height: 56, turn: 'human' }, { height: 40 }]);

    expect(layout.agentLane).toBe('M16 0 V28 C16 62 28 62 28 96');
    expect(layout.trunk).toBe('M28 96 V96');
  });

  it('starts the fuse at the top when nothing is open', () => {
    const layout = layoutLanes([{ height: 40 }, { height: 56, turn: 'none' }]);

    expect(layout.youLane).toBe('M40 0 V0 C40 34 28 34 28 68');
    expect(layout.trunk).toBe('M28 68 V96');
  });

  it('puts the node of an unfolded row at its head, not the centre of the row and its detail', () => {
    const layout = layoutLanes([
      { height: 48 },
      { height: 356, turn: 'human', node: 28 },
      { height: 56, turn: 'none' },
    ]);

    expect(layout.height).toBe(460);
    expect(layout.rows).toEqual([
      { y: 76, x: 40 },
      { y: 432, x: 28 },
    ]);
  });

  it('runs the lanes straight through the detail of an unfolded open row before they fuse', () => {
    const layout = layoutLanes([
      { height: 356, turn: 'agent', node: 28 },
      { height: 48 },
      { height: 56, turn: 'none' },
    ]);
    // the lanes run as far past the detail as the node sits below the row top: 356 - 28 = 328
    expect(layout.agentLane).toBe('M16 0 V328 C16 380 28 380 28 432');
  });

  it('draws plain lanes fusing at the bottom for an empty list', () => {
    const layout = layoutLanes([]);

    expect(layout.height).toBe(0);
    expect(layout.rows).toEqual([]);
    expect(layout.agentLane).toBe('M16 0 V0 C16 0 28 0 28 0');
  });
});

describe('layoutLanes with closed rows between the lanes', () => {
  it('runs the lanes past a closed child nested in an open section, fusing at the closed section', () => {
    const layout = layoutLanes([
      { height: 66, turn: 'human', node: 24 },
      { height: 44, turn: 'none', between: true },
      { height: 60 },
      { height: 66, turn: 'none', node: 24 },
    ]);

    expect(layout.rows).toEqual([
      { y: 24, x: 40 },
      { y: 88, x: 28 },
      { y: 194, x: 28 },
    ]);
    // the nested closed row keeps the lanes open: they run to its bottom (110 - 22 = 88)
    expect(layout.youLane).toBe('M40 0 V88 C40 141 28 141 28 194');
  });
});

describe('branchPieces', () => {
  const top = (opens = false) => ({ depth: 0, height: 62, node: 21, opens });
  const child = (depth: number, opens = false) => ({ depth, height: 54, node: 18, opens });

  it('leaves from the parent type slot centre, 3px under the slot', () => {
    const [parent] = branchPieces([top(true), child(1)]);

    // slot 84..104 centred at x=94 on y=21: its bottom is 31, the stub starts at 34.
    expect(parent).toEqual([{ kind: 'stub', level: 0, y0: 34, y1: 62, d: 'M94 34 V62' }]);
  });

  it('turns into each child with an elbow that stops 4px before its slot', () => {
    const [, first, second] = branchPieces([top(true), child(1), child(1)]);

    expect(first).toEqual([
      { kind: 'leg', level: 0, y0: 0, y1: 54, d: 'M94 0 V54' },
      { kind: 'elbow', level: 0, y0: 10, y1: 30, d: 'M94 10 Q94 18 102 18 H108' },
    ]);
    // the last child ends the leg where its elbow starts
    expect(second?.[0]).toEqual({ kind: 'leg', level: 0, y0: 0, y1: 10, d: 'M94 0 V10' });
  });

  it('runs an ancestor branch past a nested block while the ancestor has siblings to come', () => {
    const pieces = branchPieces([top(true), child(1, true), child(2), child(2), child(1)]);

    // the grandchildren carry the level-0 leg on to the last child, and hang from x=122
    expect(pieces[2]?.map((piece) => piece.d)).toEqual([
      'M94 0 V54',
      'M122 0 V54',
      'M122 10 Q122 18 130 18 H136',
    ]);
    expect(pieces[3]?.map((piece) => piece.d)).toEqual([
      'M94 0 V54',
      'M122 0 V10',
      'M122 10 Q122 18 130 18 H136',
    ]);
    expect(pieces[1]?.at(-1)).toEqual({
      kind: 'stub',
      level: 1,
      y0: 31,
      y1: 54,
      d: 'M122 31 V54',
    });
  });

  it('stops an ancestor branch after its last child', () => {
    const pieces = branchPieces([top(true), child(1), child(1, true), child(2)]);

    expect(pieces[3]?.map((piece) => piece.level)).toEqual([1, 1]);
  });

  it('never runs a branch through a detail unfolded in place, whatever row it opens in', () => {
    const open = (row: TreeRow, panel: number): TreeRow => ({
      ...row,
      height: row.height + panel,
      panel,
    });

    // The parent opened: its stub stops at the row, the first child's leg picks up under the card.
    const [parent, first] = branchPieces([open(top(true), 400), child(1)]);
    expect(parent).toEqual([{ kind: 'stub', level: 0, y0: 34, y1: 62, d: 'M94 34 V62' }]);
    expect(first?.[0]).toMatchObject({ d: 'M94 0 V10' });

    // A child opened between siblings, with a grandchild level running past it: every line in its
    // block ends at its own 54px.
    const pieces = branchPieces([
      top(true),
      child(1, true),
      open(child(2), 300),
      child(2),
      child(1),
    ]);
    const ends = (pieces[2] ?? []).map((piece) => piece.y1);
    expect(Math.max(...ends)).toBeLessThanOrEqual(54);
    expect(pieces[2]?.map((piece) => piece.d)).toEqual([
      'M94 0 V54',
      'M122 0 V54',
      'M122 10 Q122 18 130 18 H136',
    ]);
  });

  it('draws nothing for a row with no parent and no children shown', () => {
    expect(branchPieces([top(), top()])).toEqual([[], []]);
  });
});
