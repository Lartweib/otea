import { afterEach, describe, expect, it, vi } from 'vitest';
import { setMotionPref } from '../../motion/reduced.ts';
import { GLINT, glint, glintFrames } from './glint.ts';

// The toast's light (mock .pop .pline .glint, showToast): a short blue glint travels along the top
// line from left to right, when the toast opens and when a second message replaces the first.

const surface = (width: number) => {
  const animate = vi.fn();
  const line = { animate };
  const node = {
    offsetWidth: width,
    querySelector: (s: string) => (s === '.glint' ? line : null),
  } as unknown as HTMLElement;
  return { node, animate };
};

afterEach(() => {
  setMotionPref('system');
  vi.unstubAllGlobals();
});

describe('the glint', () => {
  it('enters from beyond the left end and leaves past the right one, lit in between', () => {
    expect(glintFrames(400)).toEqual([
      { transform: 'translateX(-70px)', opacity: 0 },
      { opacity: 1, offset: 0.25 },
      { opacity: 1, offset: 0.7 },
      { transform: 'translateX(400px)', opacity: 0 },
    ]);
  });

  it('runs once along the line, after the delay it is given', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'full', setItem: () => undefined });
    const { node, animate } = surface(520);
    glint(node, GLINT.open);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[0]).toEqual(glintFrames(520));
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 720, delay: GLINT.open });
  });

  it('waits for the line to draw on open, and goes at once on a replace', () => {
    expect(GLINT.open).toBeGreaterThan(0);
    expect(GLINT.open).toBeLessThan(300);
    expect(GLINT.replace).toBe(0);
  });

  it('stays dark under reduced motion', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'reduced', setItem: () => undefined });
    const { node, animate } = surface(520);
    glint(node, 0);
    expect(animate).not.toHaveBeenCalled();
  });
});
