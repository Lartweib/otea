import { anim } from '../motion/anim.ts';
import { clamp, F, lerp } from '../motion/curves.ts';
import { drive } from '../motion/drive.ts';
import { reduced } from '../motion/reduced.ts';
import { spring } from '../motion/spring.ts';
import {
  type Direction,
  dragProgress,
  LATER_POSE,
  stampShift,
  throwFade,
  throwTo,
  tiltOf,
} from '../triage.ts';

// How a card moves on the stack. Every frame is a pure function of where the card is:
// - held: it follows the pointer, tilting with the pull; its stamp and its leading edge come up with
//   the pull (--p, 0 to 1), the card under it rises a little toward its place (--rise on the stack)
//   and, past the threshold, the stamp sets (data-armed);
// - let go past the threshold (or decided by a button): it is thrown on its way, keeping the speed
//   it was let go at, and lets go of its opacity before it lands, while the card under it rises
//   into its place (560, settle, from wherever the pull had brought it);
// - let go short of it: it springs home with the same speed, the card under it sinks back;
// - with its pile beside the stack (a wide screen): thrown onto it, brought down to the pile's width,
//   and let go only as it lands there, where the pile's new top card takes over;
// - taken back (Deshacer, a failed move): the throw mirrored, back from the side (or the pile) it
//   left by;
// - under reduced motion: crossfades in place.
// While it moves sideways the card is drawn by its face: a copy fixed over where it rests, above
// everything (--z-flight), so it flies over the view's edge instead of being cut by it. The card
// itself waits unseen in the stack (it keeps the pointer) and is seen again once the face lands.

export type Flight = { done: Promise<void>; cancel: () => void };
// Where a thrown card lands on its pile, from where it rests (pileLanding).
export type Landing = { x: number; y: number; scale: number };

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

const faces = new WeakMap<HTMLElement, HTMLElement>();

// The card's face: its copy in the flight layer, fixed over where the card rests (the stack's
// corner), made on first need. Never under reduced motion, where the card does not move sideways
// and is its own face.
function faceOf(card: HTMLElement): HTMLElement {
  const had = faces.get(card);
  if (had) return had;
  if (reduced()) return card;
  const box = stackOf(card)?.getBoundingClientRect();
  const left = box?.left ?? 0;
  const face = card.cloneNode(true) as HTMLElement;
  for (const el of face.querySelectorAll('[id]')) el.removeAttribute('id');
  face.setAttribute('aria-hidden', 'true');
  face.inert = true;
  face.classList.add('tflight');
  face.dataset.left = String(left);
  face.style.left = `${left}px`;
  face.style.top = `${box?.top ?? 0}px`;
  face.style.width = `${card.offsetWidth}px`;
  face.style.height = `${card.offsetHeight}px`;
  document.body.append(face);
  card.style.visibility = 'hidden';
  faces.set(card, face);
  return face;
}

// The face is gone and the card is seen again where it rests.
function land(card: HTMLElement): void {
  faces.get(card)?.remove();
  faces.delete(card);
  card.style.visibility = '';
}

// A card leaving the page mid-gesture takes its face with it.
export const dropFace = (card: HTMLElement): void => land(card);

// The stamp of the side the card leans to stays on the screen as the card is pulled off it.
function keepStamp(face: HTMLElement, side: Direction | undefined, x: number): void {
  for (const stamp of face.querySelectorAll<HTMLElement>('.tstamp')) {
    const shift =
      side && stamp.dataset.side === side
        ? stampShift(
            side,
            { at: stamp.offsetLeft, width: stamp.offsetWidth },
            { left: Number(face.dataset.left ?? 0), width: face.offsetWidth },
            x,
            window.innerWidth,
          )
        : 0;
    stamp.style.setProperty('--shift', `${shift.toFixed(1)}px`);
  }
}

function pose(face: HTMLElement, x: number, tilt = tiltOf(x), y = 0, scale = 1): void {
  face.style.transform =
    y === 0 && scale === 1
      ? `translateX(${x.toFixed(2)}px) rotate(${tilt.toFixed(3)}deg)`
      : `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${tilt.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
}

// A card landing on its pile stays whole until it is almost there, then hands over to the pile.
const landFade = (k: number): number => 1 - F.drift(clamp((k - 0.62) / 0.33));

// The card where the pointer has it, and what that pull says.
export function hold(card: HTMLElement, x: number): void {
  const p = dragProgress(x, card.offsetWidth);
  card.dataset.x = x.toFixed(2);
  const face = faceOf(card);
  const side: Direction | undefined = x > 0.5 ? 'right' : x < -0.5 ? 'left' : undefined;
  // Under reduced motion the card stays put: the stamp and the edge alone say where it would go.
  if (face === card) face.style.transform = '';
  else {
    pose(face, x);
    keepStamp(face, side, x);
  }
  face.style.setProperty('--p', p.toFixed(4));
  if (side) face.dataset.lean = side;
  else delete face.dataset.lean;
  if (p >= 1) face.dataset.armed = '';
  else delete face.dataset.armed;
  setRise(stackOf(card), p * PULL_RISE);
}

// Where the card is held sideways now (0 at rest).
export const heldAt = (card: HTMLElement): number => Number(card.dataset.x ?? 0);

// Lifted off the stack as the drag starts.
export function lift(card: HTMLElement): void {
  faceOf(card).dataset.held = '';
}

function rest(card: HTMLElement): void {
  land(card);
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

// Thrown on its way: from where it was let go (x, at speed v in px/ms), on to its side, or onto
// its pile when there is one to land on.
export function throwOut(
  card: HTMLElement,
  side: Direction,
  x = 0,
  v = 0,
  landing?: Landing,
): Flight {
  const stack = stackOf(card);
  card.style.pointerEvents = 'none';
  if (reduced()) {
    setRise(stack, 1);
    return faded(anim(card, [{ opacity: 1 }, { opacity: 0 }], 160, 'drift', 0, 'forwards'));
  }
  const face = faceOf(card);
  delete face.dataset.held;
  const to = landing ? landing.x : throwTo(side, x);
  // A button press starts still; a fling carries its speed (never against its way).
  const v0 = side === 'right' ? Math.max(0, v) : Math.min(0, v);
  const at = spring(x, to, v0, THROW);
  const rise0 = riseOf(stack);
  const p0 = Number(face.style.getPropertyValue('--p') || 0);
  face.dataset.lean = side;
  const thrown = flight(THROW, (k, t) => {
    const now = at(t).x;
    card.dataset.x = now.toFixed(2);
    if (landing) {
      // Onto the pile: down and smaller as it goes, straightening as it settles there.
      const e = F.settle(k);
      pose(face, now, tiltOf(now) * (1 - e), lerp(0, landing.y, e), lerp(1, landing.scale, e));
      face.style.opacity = landFade(k).toFixed(4);
    } else {
      const fade = throwFade(k);
      pose(face, now, tiltOf(now) * 1.3);
      keepStamp(face, side, now);
      face.style.opacity = fade.toFixed(4);
      face.style.filter = `blur(${((1 - fade) * 1.5).toFixed(2)}px)`;
    }
    // The stamp is already set when the card leaves by a button: the decision reads all the way.
    face.style.setProperty('--p', Math.max(p0, F.settle(clamp(k * 3))).toFixed(4));
    face.dataset.armed = '';
    riseWith(stack, rise0, k);
  });
  // Landed, the face goes; the card stays unseen until the pass lets it go.
  void thrown.done.then(() => {
    face.remove();
    if (faces.get(card) === face) faces.delete(card);
  });
  return thrown;
}

// Left for later: it drops behind as the card under it rises.
export function dropLater(card: HTMLElement): Flight {
  const stack = stackOf(card);
  card.style.pointerEvents = 'none';
  if (reduced()) {
    setRise(stack, 1);
    return faded(anim(card, [{ opacity: 1 }, { opacity: 0 }], 160, 'drift', 0, 'forwards'));
  }
  anim(
    card,
    [
      { transform: 'none', opacity: 1, filter: 'blur(0px)' },
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
  const face = faces.get(card);
  if (face) delete face.dataset.held;
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

// Taken back: the throw mirrored, from the side (or the pile) it left by to its place, while the
// card that had risen sinks back under it.
export function returnIn(card: HTMLElement, side: Direction, landing?: Landing): Flight {
  const stack = stackOf(card);
  if (reduced()) {
    setRise(stack, 0);
    return faded(anim(card, [{ opacity: 0 }, { opacity: 1 }], 160, 'drift', 0, 'backwards'));
  }
  const from = landing ? landing.x : throwTo(side, 0);
  const at = spring(from, 0, 0, THROW);
  const face = faceOf(card);
  return flight(THROW, (k, t) => {
    if (k >= 1) {
      rest(card);
      setRise(stack, 0);
      return;
    }
    const now = at(t).x;
    if (landing) {
      // Lifted off its pile, growing back to its size as it comes home.
      const e = F.settle(k);
      pose(face, now, 0, lerp(landing.y, 0, e), lerp(landing.scale, 1, e));
      face.style.opacity = F.drift(clamp(k * 2.4)).toFixed(4);
      setRise(stack, 1 - e);
      return;
    }
    // It is seen as it comes in, whole well before it lands.
    const fade = F.drift(clamp(k * 2.4));
    pose(face, now, tiltOf(now) * 1.3);
    face.style.opacity = fade.toFixed(4);
    face.style.filter = `blur(${((1 - fade) * 1.5).toFixed(2)}px)`;
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
