import { describe, expect, it } from 'vitest';
import { F } from '../../motion/curves.ts';
import {
  aFade,
  branchProgress,
  childResolve,
  colFade,
  edgeFrame,
  GLIDE_T,
  glideFrame,
  glideFrom,
  inkHead,
  morphDelay,
  morphEnds,
  near,
  plateOpacity,
  revealAt,
  titleFrame,
  treeSpan,
  treeStepSpan,
  whoFrame,
} from './motion-math.ts';

describe('the tree fold clock (mock:2298-2352)', () => {
  it('takes min(720, 220 + 64 n), the same both ways', () => {
    expect(treeSpan(1)).toBe(284);
    expect(treeSpan(3)).toBe(412);
    expect(treeSpan(9)).toBe(720);
  });

  it('turning back mid-way takes what is left of the way, never under 160', () => {
    expect(treeStepSpan(412, 0, 0.5)).toBe(206);
    expect(treeStepSpan(412, 1, 0.9)).toBe(160);
    expect(treeStepSpan(412, 0, 1)).toBe(412);
  });

  const g = {
    y0: 30,
    top: 40,
    ks: [
      { cy: 50, top: 40, h: 34 },
      { cy: 84, top: 74, h: 34 },
    ],
  };

  it('reveals the children as the ink head reaches each node', () => {
    expect(revealAt(30, g)).toBe(0);
    expect(revealAt(50, g)).toBe(34);
    expect(revealAt(84, g)).toBe(68);
    expect(revealAt(67, g)).toBe(51);
  });

  it('resolves a child over 56 px of head, ending at rest', () => {
    expect(childResolve(50 - 16, 50)).toBe(0);
    expect(childResolve(50 + 40, 50)).toBe(1);
    expect(childResolve(50 + 12, 50)).toBeCloseTo(1 - 0.5 ** 3);
  });

  it('draws the branch leg and each elbow behind the head', () => {
    const p = branchProgress(84 - 7, g);
    expect(p.leg).toBe(1);
    expect(p.elbows).toEqual([1, 0.65]);
    expect(branchProgress(30, g)).toEqual({ leg: 0, elbows: [0, 0] });
  });
});

describe('the morph (mock:2441-2573)', () => {
  it('delays cards column by column, rows by their order, both capped', () => {
    expect(morphDelay({ col: 0, i: 0 })).toBe(0);
    expect(morphDelay({ col: 2, i: 1 })).toBe(162);
    expect(morphDelay({ col: 4, i: 3 })).toBe(200);
    expect(morphDelay({ idx: 3 })).toBe(54);
    expect(morphDelay({ idx: 30 })).toBe(140);
  });

  it('crosses the two copies of a title, blurred only in the middle', () => {
    expect(titleFrame(0)).toEqual({ a: 1, b: 0, blur: 0 });
    expect(titleFrame(1)).toEqual({ a: 0, b: 1, blur: 0 });
    const mid = titleFrame(0.45);
    expect(mid.a).toBeGreaterThan(0);
    expect(mid.b).toBeGreaterThan(0);
    expect(mid.blur).toBeGreaterThan(0.6);
  });

  it('swaps who and when a little later than the title', () => {
    expect(whoFrame(0)).toEqual({ a: 1, b: 0 });
    expect(whoFrame(0.3).b).toBe(0);
    expect(whoFrame(1)).toEqual({ a: 0, b: 1 });
  });

  it('gathers a card edge into the node, which grows out of it', () => {
    const start = edgeFrame(0);
    expect(start).toMatchObject({ eu: 0, edge: 1, node: 0, scale: 0.4 });
    const end = edgeFrame(1);
    expect(end).toMatchObject({ eu: 1, edge: 0, node: 1, scale: 1 });
    expect(edgeFrame(0.6).eu).toBe(1);
  });

  it('lets the card plate go early toward a list, late toward Pasos', () => {
    expect(plateOpacity(0, true)).toBe(1);
    expect(plateOpacity(0.3, true)).toBe(0);
    expect(plateOpacity(0.08, false)).toBe(1);
    expect(plateOpacity(0.5, false)).toBe(0);
  });

  it('runs the ink head forward over 640 ms after 140, back over 480, from where it is', () => {
    expect(inkHead({ fwd: true, t: 140, h0: 0, rev: false })).toBe(0);
    expect(inkHead({ fwd: true, t: 780, h0: 0, rev: false })).toBe(1);
    expect(inkHead({ fwd: true, t: 460, h0: 0, rev: false })).toBeCloseTo(F.ink(0.5));
    expect(inkHead({ fwd: false, t: 0, h0: 0.5, rev: true })).toBe(0.5);
    expect(inkHead({ fwd: false, t: 240, h0: 0.5, rev: true })).toBe(0);
  });

  it('fades the old side out over 220, back in over 300 when reversed', () => {
    expect(aFade({ fwd: true, t: 0, a0: 1 })).toBe(1);
    expect(aFade({ fwd: true, t: 220, a0: 1 })).toBe(0);
    expect(aFade({ fwd: false, t: 300, a0: 0.2 })).toBe(1);
  });

  it('brings the Pasos columns in one by one after their rule', () => {
    expect(colFade({ fwd: true, t: 300, ci: 0, o0: 0, rev: false }).o).toBe(0);
    expect(colFade({ fwd: true, t: 1000, ci: 0, o0: 0, rev: false }).o).toBe(1);
    expect(colFade({ fwd: true, t: 300, ci: 1, o0: 0, rev: false }).rule).toBe(0);
    expect(colFade({ fwd: false, t: 200, ci: 1, o0: 1, rev: true }).o).toBe(0);
  });

  it('moves only what is within the viewport and 160 px around it', () => {
    const vr = { top: 100, bottom: 900 };
    expect(near({ y: 100, h: 20 }, 1000, vr)).toBe(false);
    expect(near({ y: -900, h: 20 }, 1000, vr)).toBe(true);
    expect(near({ y: -1090, h: 20 }, 1000, vr)).toBe(false);
  });
});

describe('the morph ends a frame after its last piece lands', () => {
  // The frame a piece lands draws it as the real piece; the morph lets that frame show before it
  // goes, so its last frame is the destination and nothing moves when it ends.
  it('does not end in the frame everything first comes to rest', () => {
    expect(morphEnds(false, true)).toBe(false);
  });

  it('ends in the next one, if it is still at rest', () => {
    expect(morphEnds(true, true)).toBe(true);
    expect(morphEnds(true, false)).toBe(false);
  });
});

describe('the board column glides with the morph', () => {
  // On a wide screen each view sets the column's width, so a switch moves the head, the tools and
  // the stage. Each is laid out at once where it ends and glides there from where it was, on the
  // morph's own clock, so a turn back starts from where they are.
  const a = { left: 600, top: 80, width: 1040 };
  const b = { left: 280, top: 80, width: 1680 };

  it('starts where each piece was', () => {
    expect(glideFrom(a, b, false)).toEqual({ dx: 320, dy: 0, sx: 1 });
  });

  it('stretches a rule by its width, from its left end', () => {
    expect(glideFrom(a, b, true)?.sx).toBeCloseTo(1040 / 1680);
  });

  it('leaves alone what did not move', () => {
    expect(glideFrom(a, a, true)).toBeNull();
  });

  it('goes from the start to nothing on the settle curve', () => {
    const g = { dx: 320, dy: 0, sx: 0.5 };
    expect(glideFrame(g, 0, GLIDE_T)).toBe('translate(320px, 0px) scale(0.5, 1)');
    const mid = 1 - F.settle(0.5);
    expect(glideFrame(g, GLIDE_T / 2, GLIDE_T)).toBe(
      `translate(${320 * mid}px, 0px) scale(${1 - 0.5 * mid}, 1)`,
    );
    expect(glideFrame({ dx: 320, dy: 0, sx: 1 }, 0, GLIDE_T)).toBe('translate(320px, 0px)');
  });

  it('writes nothing once it has arrived, so the last frame is the layout itself', () => {
    expect(glideFrame({ dx: 320, dy: 0, sx: 0.5 }, GLIDE_T, GLIDE_T)).toBe('');
    expect(glideFrame({ dx: 320, dy: 0, sx: 0.5 }, GLIDE_T + 200, GLIDE_T)).toBe('');
  });

  it('lands within the shortest morph', () => {
    expect(GLIDE_T).toBeLessThanOrEqual(520);
  });
});
