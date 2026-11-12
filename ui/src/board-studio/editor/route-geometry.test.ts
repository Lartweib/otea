import { describe, expect, it } from 'vitest';
import { creatures, errores, tareasDeRepo } from '../../../../src/core/board/testing.ts';
import {
  backArcs,
  backLoop,
  branchMarks,
  geom,
  labelSpot,
  lanePaths,
  pathOf,
  plusSpots,
  pointsOf,
  RY,
  seg,
  skipBypass,
  vrouteRows,
  waitMarks,
  wayArcs,
} from './route-geometry.ts';

// Criaturas: Concepto (any agent, you review, may go to Hecho), Animar (kiln, scout reviews, a
// send-back lands on Concepto), Pulir (you, nobody reviews).
describe('geom', () => {
  it('lays the stops evenly between Crear and Hecho, each on its doer’s lane', () => {
    const g = geom(creatures(), 900);
    expect(g.col).toBe(200.5);
    expect(g.stops.map((s) => [s.key, s.x, s.y])).toEqual([
      ['form', 64, RY.mid],
      ['sconcept', 265, RY.ag],
      ['sanimate', 465, RY.ag],
      ['spolish', 666, RY.you],
      ['done', 866, RY.mid],
    ]);
  });

  it('visits your lane for your review, and marks an agent’s review on its own lane', () => {
    const [, concept, animate, polish] = geom(creatures(), 900).stops;
    expect(concept?.rv).toEqual({ x: 349, y: RY.you, same: false, you: true });
    expect(animate?.rv).toEqual({ x: 549, y: RY.ag, same: true, you: false });
    expect(polish?.rv).toBeNull();
  });
});

describe('paths', () => {
  it('runs straight on a lane and bends across lanes', () => {
    expect(seg([0, 46], [100, 46])).toBe('H100');
    expect(seg([0, 46], [100, 86])).toBe('H20C42.5 46 57.5 86 80 86H100');
  });

  it('passes every stop and every visit to the other lane', () => {
    const pts = pointsOf(geom(creatures(), 900));
    expect(pts).toEqual([
      [64, 66],
      [265, 46],
      [349, 86],
      [465, 46],
      [666, 86],
      [866, 66],
    ]);
    expect(pathOf(pts).startsWith('M64 66H')).toBe(true);
  });

  it('bends both lanes into the trunk at Hecho', () => {
    const lanes = lanePaths(geom(creatures(), 900));
    expect(lanes.ag).toBe('M24 46H798C828 46 836 66 866 66');
    expect(lanes.trunk).toBe('M866 66H900');
  });
});

describe('ways and send-backs', () => {
  it('arcs from the review over the agents’ lane to the other way’s stop', () => {
    const [arc, ...rest] = wayArcs(creatures(), geom(creatures(), 900));
    expect(rest).toEqual([]);
    expect(arc).toMatchObject({ from: 'sconcept', to: 'done' });
    expect(arc?.d).toBe('M349 86C359 16 850 16 866 60');
    expect(arc?.label).toEqual({ x: 607.5, y: 20 });
  });

  it('loops under your lane back to where a send-back lands, only for your review', () => {
    const def = creatures();
    const g = geom(def, 900);
    expect(backLoop(g, 'sanimate')).toBeNull();
    const loop = backLoop(g, 'sconcept');
    expect(loop?.d).toBe('M349 86C349 112 317 112 307 112S265 112 265 52');
    expect(loop?.label).toEqual({ x: 307, y: 127, right: 349 });
  });
});

describe('controls', () => {
  it('puts a + between each pair of stops', () => {
    expect(plusSpots(geom(creatures(), 900))).toEqual([
      { at: 0, x: 164.5, y: RY.mid },
      { at: 1, x: 407, y: RY.mid },
      { at: 2, x: 565.5, y: RY.mid },
      { at: 3, x: 766, y: RY.mid },
    ]);
  });

  it('starts the first label at its stop and ends the last one at its stop', () => {
    const g = geom(creatures(), 900);
    expect(labelSpot(g, 0)).toEqual({ x: 50, pos: 'first' });
    expect(labelSpot(g, 2)).toEqual({ x: 465, pos: 'mid' });
    expect(labelSpot(g, 4)).toEqual({ x: 872, pos: 'last' });
  });
});

describe('vrouteRows', () => {
  it('puts each stop on the lane of whoever does it, and Hecho on the trunk', () => {
    expect(vrouteRows(creatures())).toEqual([
      { key: 'form', lane: 'ag', look: 'waiting' },
      { key: 'sconcept', lane: 'ag', look: 'queued' },
      { key: 'sanimate', lane: 'ag', look: 'queued' },
      { key: 'spolish', lane: 'you', look: 'yours' },
      { key: 'done', lane: 'none', look: 'done' },
    ]);
  });
});

describe('the marks of a board for everything', () => {
  it('draws a way back as a dashed loop on the doer’s lane, ending in an arrowhead', () => {
    const def = errores();
    const g = geom(def, 900);
    const arcs = backArcs(def, g);
    expect(arcs.map((a) => [a.from, a.to, a.you])).toEqual([
      ['striage', 'sfill', true],
      ['sfix', 'striage', false],
    ]);
    const [mine, theirs] = arcs;
    // Your lane: the loop hangs below it; the agents' lane: it rises above it.
    expect(mine?.label.y).toBeGreaterThan(RY.you);
    expect(theirs?.label.y).toBeLessThan(RY.ag);
    expect(mine?.d.startsWith('M')).toBe(true);
    expect(mine?.head.startsWith('M')).toBe(true);
  });

  it('draws the skip on creation above the agents’ lane, from the start dot to the second step', () => {
    const def = errores();
    const g = geom(def, 900);
    const bypass = skipBypass(def, g);
    const second = g.stops[2];
    expect(bypass).not.toBeNull();
    expect(bypass?.label.y).toBeLessThan(RY.ag - 19);
    expect(bypass?.d).toContain(`${(second?.x ?? 0) - 4} ${(second?.y ?? 0) - 7}`);
    const plain = creatures();
    expect(skipBypass(plain, geom(plain, 900))).toBeNull();
  });

  it('marks a waiting step with an hourglass, and push steps and Hecho with a branch', () => {
    const def = tareasDeRepo();
    const g = geom(def, 900);
    expect(branchMarks(def, g).map((m) => m.key)).toEqual(['simpl', 'done']);
    const err = errores();
    expect(waitMarks(geom(err, 900)).map((m) => m.key)).toEqual(['sfix']);
    expect(branchMarks(creatures(), geom(creatures(), 900))).toEqual([]);
  });
});
