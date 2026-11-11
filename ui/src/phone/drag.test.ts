import { describe, expect, it } from 'vitest';
import { DRAG, dragFrame, dragStart, release } from './drag.ts';

describe('dragFrame', () => {
  it('follows the finger downward one to one', () => {
    const s = dragStart(100, 0, null, 0);
    const f = dragFrame(s, 160, 16);
    expect(f.y).toBe(60);
    expect(f.scroll).toBe(0);
  });

  it('resists upward with 0.35', () => {
    const s = dragStart(100, 0, null, 0);
    expect(dragFrame(s, 60, 16).y).toBeCloseTo(-40 * DRAG.resist);
  });

  it('starts from where the sheet was when the finger caught it', () => {
    const s = dragStart(100, 0, null, 120);
    expect(dragFrame(s, 110, 16).y).toBe(130);
  });

  it('scrolls a sheet taller than the screen before it moves the sheet', () => {
    // 200 px of content below the fold, scrolled 50 down: dragging up scrolls on, down scrolls back
    const s = dragStart(400, 0, { scroll: 50, max: 200 }, 0);
    const up = dragFrame(s, 300, 16);
    expect(up).toMatchObject({ y: 0, scroll: 150 });
    const past = dragFrame(s, 200, 16);
    expect(past.scroll).toBe(200);
    expect(past.y).toBeCloseTo(-50 * DRAG.resist);
    const down = dragFrame(s, 430, 16);
    expect(down).toMatchObject({ y: 0, scroll: 20 });
    const pull = dragFrame(s, 490, 16);
    expect(pull).toMatchObject({ y: 40, scroll: 0 });
  });

  it('measures the velocity of the sheet, in px per ms', () => {
    const s = dragStart(0, 0, null, 0);
    const a = dragFrame(s, 20, 10);
    const b = dragFrame(a.state, 50, 20);
    expect(b.v).toBeCloseTo(3);
  });

  it('only becomes a drag past the slop', () => {
    const s = dragStart(100, 0, null, 0);
    expect(dragFrame(s, 100 + DRAG.slop - 1, 5).state.moved).toBe(false);
    expect(dragFrame(s, 100 + DRAG.slop + 1, 5).state.moved).toBe(true);
  });
});

describe('release', () => {
  it('dismisses past 30% of the height', () => {
    expect(release(301, 0, 1000)).toBe('dismiss');
    expect(release(299, 0, 1000)).toBe('back');
  });

  it('dismisses on a flick down over .5 px/ms', () => {
    expect(release(40, 0.51, 1000)).toBe('dismiss');
    expect(release(40, 0.49, 1000)).toBe('back');
  });

  it('never dismisses a sheet that is not pulled down', () => {
    expect(release(0, 2, 1000)).toBe('back');
    expect(release(-20, 2, 1000)).toBe('back');
  });
});
