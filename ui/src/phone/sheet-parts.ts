import { type Part, part } from '../motion/choreo.ts';
import { STAGGER } from '../motion/time.ts';

// A bottom sheet's gesture (mock:3588-3594): the scrim fades in while the sheet rises from below
// its edge, the grab draws from its centre, and the rows resolve one after another. Closing is the
// same parts mirrored (Choreo), the rows leaving first and the scrim last. Opened from a button
// (grow), it also grows out of that button as it rises: the sheet's transform-origin is put there.
export function sheetParts(o: {
  scrim: Element | null | undefined;
  sheet: Element | null | undefined;
  grab: Element | null | undefined;
  items: readonly Element[];
  grow?: boolean;
}): Part[] {
  const g = o.grow ? ' scale(0.92)' : '';
  const g1 = o.grow ? ' scale(1)' : '';
  return [
    part(o.scrim, { opacity: 0 }, { opacity: 1 }, 360, 'drift', 0),
    part(
      o.sheet,
      { transform: `translateY(calc(100% + 2px))${g}` },
      { transform: `translateY(0px)${g1}` },
      560,
      'settle',
      0,
    ),
    part(o.grab, { transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }, 360, 'ink', 120),
    ...o.items.flatMap((x, i) => {
      const d = 160 + STAGGER.menu * Math.min(i, STAGGER.cap);
      return [
        part(x, { opacity: 0 }, { opacity: 1 }, 340, 'drift', d),
        part(
          x,
          { transform: 'translateY(4px)' },
          { transform: 'translateY(0px)' },
          380,
          'glide',
          d,
        ),
      ];
    }),
    part(o.sheet, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true }),
  ];
}
