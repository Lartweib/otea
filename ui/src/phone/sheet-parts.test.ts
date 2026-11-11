import { describe, expect, it } from 'vitest';
import { mirrorDelays, type Part } from '../motion/choreo.ts';
import { sheetParts } from './sheet-parts.ts';

const el = (name: string) => ({ name }) as unknown as Element;
const nth = <T>(xs: readonly T[], i: number): T => {
  const x = xs.at(i);
  if (x === undefined) throw new Error(`no item ${i}`);
  return x;
};

describe('sheetParts (mock:3588-3594)', () => {
  const items = Array.from({ length: 8 }, (_, i) => el(`i${i}`));
  const parts = sheetParts({ scrim: el('scrim'), sheet: el('sheet'), grab: el('grab'), items });

  it('fades the scrim 360 drift and slides the sheet up 560 settle, both at once', () => {
    const [scrim, sheet] = parts;
    expect(scrim).toMatchObject({
      from: { opacity: 0 },
      to: { opacity: 1 },
      T: 360,
      curve: 'drift',
      d0: 0,
    });
    expect(sheet).toMatchObject({
      from: { transform: 'translateY(calc(100% + 2px))' },
      to: { transform: 'translateY(0px)' },
      T: 560,
      curve: 'settle',
      d0: 0,
    });
  });

  it('draws the grab 360 ink at 120', () => {
    expect(parts[2]).toMatchObject({
      from: { transform: 'scaleX(0)' },
      T: 360,
      curve: 'ink',
      d0: 120,
    });
  });

  it('resolves the rows at 160 + 34 * min(i, 5): opacity 340 drift, 4 px 380 glide', () => {
    const rows = parts.slice(3, -1);
    expect(rows).toHaveLength(16);
    const at = (i: number) => rows.filter((p) => p.el === items[i]);
    expect(at(0).map((p) => [p.T, p.curve, p.d0])).toEqual([
      [340, 'drift', 160],
      [380, 'glide', 160],
    ]);
    expect(nth(at(2), 0).d0).toBe(160 + 68);
    expect(nth(at(7), 0).d0).toBe(160 + 170);
    expect(nth(at(0), 1).from).toEqual({ transform: 'translateY(4px)' });
  });

  it('holds the sheet visible under reduced motion only', () => {
    expect(parts.at(-1)).toMatchObject({ el: nth(parts, 1).el, ronly: true, from: { opacity: 0 } });
  });

  it('closes as its mirror: the last thing to open is the first to close', () => {
    const copy: Part[] = parts.map(({ d1: _, ...p }) => p);
    const D = mirrorDelays(copy);
    expect(D).toBe(Math.max(...copy.map((p) => p.d0 + p.T)));
    for (const p of copy) expect((p.d1 ?? 0) + p.d0 + p.T).toBe(D);
    // the rows are gone before the sheet lands, as they came after it rose
    const row = nth(copy, 3);
    const sheet = nth(copy, 1);
    expect((row.d1 ?? 0) + row.T).toBeLessThan((sheet.d1 ?? 0) + sheet.T);
  });

  it('leaves a missing part for the Choreo to skip', () => {
    expect(sheetParts({ scrim: null, sheet: el('s'), grab: null, items: [] })).toHaveLength(4);
  });

  it('rises from a button: the sheet grows out of where it was pressed as it comes up', () => {
    const grown = sheetParts({ scrim: null, sheet: el('s'), grab: null, items: [], grow: true });
    expect(nth(grown, 1)).toMatchObject({
      from: { transform: 'translateY(calc(100% + 2px)) scale(0.92)' },
      to: { transform: 'translateY(0px) scale(1)' },
      T: 560,
      curve: 'settle',
    });
  });
});
