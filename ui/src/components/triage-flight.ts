import { anim } from '../motion/anim.ts';
import { reduced } from '../motion/reduced.ts';
import { exitPose, type TriKind } from '../triage.ts';

// How a decided card leaves the stack (mock:4031-4035): it flies (an approval right, a send-back
// left, both tilted; a card left for later drops behind) and dissolves, 520 settle, while the card
// under it rises into its place, 560 settle at 120. Under reduced motion it fades in place.

// The whole decision, from the press to the next card in place.
export const DECIDE_MS = 640;
const UNDER = 'translateY(14px) scale(0.975)';

// The card starts from where it is (a drag on the phone leaves it pulled): never a jump.
export function flyOut(card: HTMLElement, kind: TriKind): Animation {
  const from = card.style.transform || 'none';
  card.style.pointerEvents = 'none';
  if (reduced()) return anim(card, [{ opacity: 1 }, { opacity: 0 }], 160, 'drift', 0, 'forwards');
  return anim(
    card,
    [
      { transform: from, opacity: 1, filter: 'blur(0px)' },
      { transform: exitPose(kind), opacity: 0, filter: 'blur(1px)' },
    ],
    520,
    'settle',
    0,
    'forwards',
  );
}

export function riseUnder(under: HTMLElement | null | undefined): Animation | undefined {
  if (!under || reduced()) return undefined;
  return anim(
    under,
    [
      { transform: UNDER, opacity: 0.55 },
      { transform: 'none', opacity: 1 },
    ],
    560,
    'settle',
    120,
    'forwards',
  );
}

// The card that comes to wait under the new top one resolves there instead of popping in.
export function arriveUnder(under: HTMLElement): Animation | undefined {
  if (reduced()) return undefined;
  return anim(under, [{ opacity: 0 }, { opacity: 0.55 }], 360, 'drift', 0, 'backwards');
}

// A drag let go short of deciding settles back to the middle (on the phone).
export function settleBack(card: HTMLElement): void {
  const from = card.style.transform;
  card.style.transform = '';
  card.parentElement?.style.setProperty('--p', '0');
  if (!from || from === 'none' || reduced()) return;
  anim(card, [{ transform: from }, { transform: 'none' }], 440, 'settle', 0, 'none');
}
