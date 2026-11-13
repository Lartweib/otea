import { type Part, part } from '../motion/choreo.ts';
import { STAGGER } from '../motion/time.ts';

// A bottom sheet's gesture (mock:3588-3594): the scrim fades in while the sheet rises from below
// its edge, the grab draws from its centre, and the rows resolve one after another. Closing is the
// same parts played back (Choreo), but at once: the sheet starts down in the frame it is let go, with
// the rows and the grab leaving as it goes and the scrim fading out to land with it. Nothing waits
// for the rows' stagger, so a close never sits still first. Opened from a button (grow), it also
// grows out of that button as it rises: the sheet's transform-origin is put there.
const SHEET = 560;
const SCRIM = 360;
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
    part(o.scrim, { opacity: 0 }, { opacity: 1 }, SCRIM, 'drift', 0, { d1: SHEET - SCRIM }),
    part(
      o.sheet,
      { transform: `translateY(calc(100% + 2px))${g}` },
      { transform: `translateY(0px)${g1}` },
      SHEET,
      'settle',
      0,
      { d1: 0 },
    ),
    part(o.grab, { transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }, 360, 'ink', 120, {
      d1: 0,
    }),
    ...o.items.flatMap((x, i) => {
      const d = 160 + STAGGER.menu * Math.min(i, STAGGER.cap);
      return [
        part(x, { opacity: 0 }, { opacity: 1 }, 340, 'drift', d, { d1: 0 }),
        part(
          x,
          { transform: 'translateY(4px)' },
          { transform: 'translateY(0px)' },
          380,
          'glide',
          d,
          { d1: 0 },
        ),
      ];
    }),
    part(o.sheet, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true, d1: 0 }),
  ];
}
