import { describe, expect, it } from 'vitest';
import { LANE, laneX, layoutBranches, layoutLanes } from './lanes.ts';

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

describe('layoutBranches', () => {
  const parent = { top: 0, height: 66, node: 24, x: 40, depth: 0 };
  const child = (top: number, x = 40) => ({ top, height: 44, node: 22, x, depth: 1 });

  it('leaves the bottom of the parent node and bends into its own sub-lane', () => {
    const [branch] = layoutBranches([parent, child(66), child(110, 16)]);

    expect(branch?.yours).toBe(true);
    expect(branch?.d).toBe(
      'M40 30 C40 37 52 37 52 44 V80 Q52 88 60 88 H80 M52 80 V124 Q52 132 60 132 H80',
    );
  });

  it('swings an agent parent across with a longer bend, and is not yours', () => {
    const [branch] = layoutBranches([{ ...parent, x: 16 }, child(66, 16)]);

    expect(branch?.yours).toBe(false);
    expect(branch?.d.startsWith('M16 30 C16 44.4 52 44.4 52 58.8 V80')).toBe(true);
  });

  it('drops a deeper level from the bottom of its parent row, one step right', () => {
    const grandchild = { top: 110, height: 44, node: 22, x: 40, depth: 2 };

    const branches = layoutBranches([parent, child(66), grandchild]);

    expect(branches).toHaveLength(2);
    expect(branches[1]?.d).toBe('M72 110 V124 Q72 132 80 132 H100');
  });

  it('draws nothing without children', () => {
    expect(layoutBranches([parent, { ...parent, top: 66 }])).toEqual([]);
  });
});
