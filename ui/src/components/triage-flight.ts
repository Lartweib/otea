import { anim } from '../motion/anim.ts';
import { clamp, F, lerp } from '../motion/curves.ts';
import { drive } from '../motion/drive.ts';
import { reduced } from '../motion/reduced.ts';
import { spring } from '../motion/spring.ts';
import { type Direction, dragProgress, LATER_POSE, throwFade, throwTo, tiltOf } from '../triage.ts';

// How a card moves on the stack. Every frame is a pure function of where the card is:
// - held: it follows the pointer, tilting with the pull; its stamp and its leading edge come up with
//   the pull (--p on the card, 0 to 1), the card under it rises a little toward its place (--rise on
//   the stack) and, past the threshold, the stamp sets (data-armed);
// - let go past the threshold (or decided by a button): it is thrown on its way, keeping the speed
//   it was let go at, and lets go of its opacity before it lands, while the card under it rises
//   into its place (560, settle, from wherever the pull had brought it);
// - let go short of it: it springs home with the same speed, the card under it sinks back;
// - taken back (Deshacer, a failed move): the throw mirrored, back from the side it left by;
// - under reduced motion: crossfades in place.

export type Flight = { done: Promise<void>; cancel: () => void };

const THROW = 560;
const HOME = 440;
// How far the card under the top one rises while the top one is only pulled.
const PULL_RISE = 0.45;

const stackOf = (card: HTMLElement): HTMLElement | null => card.parentElement;
const riseOf = (stack: HTMLElement | null): number =>
  Number(stack?.style.getPropertyValue('--rise') || 0);

function setRise(stack: HTMLElement | null, rise: number): void {
  stack?.style.setProperty('--rise', rise.toFixed(4));
}

// The card where the pointer has it, and what that pull says.
export function hold(card: HTMLElement, x: number): void {
  const p = dragProgress(x, card.offsetWidth);
  card.dataset.x = x.toFixed(2);
  // Under reduced motion the card stays put: the stamp and the edge alone say where it would go.
  card.style.transform = reduced()
    ? ''
    : `translateX(${x.toFixed(2)}px) rotate(${tiltOf(x).toFixed(3)}deg)`;
  card.style.setProperty('--p', p.toFixed(4));
  if (x > 0.5) card.dataset.lean = 'right';
  else if (x < -0.5) card.dataset.lean = 'left';
  else delete card.dataset.lean;
  if (p >= 1) card.dataset.armed = '';
  else delete card.dataset.armed;
  setRise(stackOf(card), p * PULL_RISE);
}

// Where the card is held sideways now (0 at rest).
export const heldAt = (card: HTMLElement): number => Number(card.dataset.x ?? 0);

// Lifted off the stack as the drag starts.
export function lift(card: HTMLElement): void {
  card.dataset.held = '';
}

function rest(card: HTMLElement): void {
  card.style.transform = '';
  card.style.opacity = '';
  card.style.filter = '';
  card.style.removeProperty('--p');
  delete card.dataset.x;
  delete card.dataset.lean;
  delete card.dataset.armed;
  delete card.dataset.held;
}

function flight(T: number, frame: (k: number, t: number) => void): Flight {
  let resolve: () => void = () => undefined;
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  const d = drive(T, (k, t) => {
    frame(k, t);
    if (k >= 1) resolve();
  });
  return {
    done,
    cancel: () => {
      d.cancel();
      resolve();
    },
  };
}

function faded(animation: Animation): Flight {
  return {
    done: animation.finished.then(
      () => undefined,
      () => undefined,
    ),
    cancel: () => animation.cancel(),
  };
}

// The card under the top one, risen into its place by the end of a decision (crossfades are
// enough under reduced motion: it is drawn in place).
function riseWith(stack: HTMLElement | null, from: number, k: number): void {
  setRise(stack, lerp(from, 1, F.settle(clamp((k * THROW - 60) / (THROW - 60)))));
}

// Thrown on its way: from where it was let go (x, at speed v in px/ms), on to its side.
export function throwOut(card: HTMLElement, side: Direction, x = 0, v = 0): Flight {
  const stack = stackOf(card);
  card.style.pointerEvents = 'none';
  delete card.dataset.held;
  if (reduced()) {
    setRise(stack, 1);
    return faded(anim(card, [{ opacity: 1 }, { opacity: 0 }], 160, 'drift', 0, 'forwards'));
  }
  const to = throwTo(side, x);
  // A button press starts still; a fling carries its speed (never against its way).
  const v0 = side === 'right' ? Math.max(0, v) : Math.min(0, v);
  const at = spring(x, to, v0, THROW);
  const rise0 = riseOf(stack);
  const p0 = Number(card.style.getPropertyValue('--p') || 0);
  card.dataset.lean = side;
  return flight(THROW, (k, t) => {
    const now = at(t).x;
    const fade = throwFade(k);
    card.dataset.x = now.toFixed(2);
    card.style.transform = `translateX(${now.toFixed(2)}px) rotate(${(tiltOf(now) * 1.3).toFixed(3)}deg)`;
    card.style.opacity = fade.toFixed(4);
    card.style.filter = `blur(${((1 - fade) * 1.5).toFixed(2)}px)`;
    // The stamp is already set when the card leaves by a button: the decision reads all the way.
    card.style.setProperty('--p', Math.max(p0, F.settle(clamp(k * 3))).toFixed(4));
    card.dataset.armed = '';
    riseWith(stack, rise0, k);
  });
}

// Left for later: it drops behind as the card under it rises.
export function dropLater(card: HTMLElement): Flight {
  const stack = stackOf(card);
  card.style.pointerEvents = 'none';
  if (reduced()) {
    setRise(stack, 1);
    return faded(anim(card, [{ opacity: 1 }, { opacity: 0 }], 160, 'drift', 0, 'forwards'));
  }
  const from = card.style.transform || 'none';
  anim(
    card,
    [
      { transform: from, opacity: 1, filter: 'blur(0px)' },
      { transform: LATER_POSE, opacity: 0, filter: 'blur(1px)' },
    ],
    520,
    'settle',
    0,
    'forwards',
  );
  const rise0 = riseOf(stack);
  return flight(THROW, (k) => riseWith(stack, rise0, k));
}

// Let go short of the threshold: home, keeping the speed it was let go at.
export function springHome(card: HTMLElement, x: number, v = 0): Flight {
  const stack = stackOf(card);
  delete card.dataset.held;
  if (reduced() || Math.abs(x) < 0.5) {
    rest(card);
    setRise(stack, 0);
    return { done: Promise.resolve(), cancel: () => undefined };
  }
  const at = spring(x, 0, v, HOME);
  return flight(HOME, (k, t) => {
    if (k >= 1) {
      rest(card);
      setRise(stack, 0);
      return;
    }
    hold(card, at(t).x);
  });
}

// Taken back: the throw mirrored, from the side it left by to its place, while the card that had
// risen sinks back under it.
export function returnIn(card: HTMLElement, side: Direction): Flight {
  const stack = stackOf(card);
  if (reduced()) {
    setRise(stack, 0);
    return faded(anim(card, [{ opacity: 0 }, { opacity: 1 }], 160, 'drift', 0, 'backwards'));
  }
  const from = throwTo(side, 0);
  const at = spring(from, 0, 0, THROW);
  return flight(THROW, (k, t) => {
    if (k >= 1) {
      rest(card);
      setRise(stack, 0);
      return;
    }
    const now = at(t).x;
    // It is seen as it comes in, whole well before it lands.
    const fade = F.drift(clamp(k * 2.4));
    card.style.transform = `translateX(${now.toFixed(2)}px) rotate(${(tiltOf(now) * 1.3).toFixed(3)}deg)`;
    card.style.opacity = fade.toFixed(4);
    card.style.filter = `blur(${((1 - fade) * 1.5).toFixed(2)}px)`;
    setRise(stack, 1 - F.settle(k));
  });
}

// The card that rose is let go of its flight; the stack starts over with nothing risen.
export function settleStack(card: HTMLElement): void {
  for (const a of card.getAnimations()) a.cancel();
  rest(card);
  card.style.pointerEvents = '';
  setRise(stackOf(card), 0);
}

// The card that comes to wait under the new top one resolves there instead of popping in.
export function arriveUnder(under: HTMLElement): Animation | undefined {
  if (reduced()) return undefined;
  const to = getComputedStyle(under).opacity;
  return anim(under, [{ opacity: 0 }, { opacity: to }], 360, 'drift', 0, 'none');
}
