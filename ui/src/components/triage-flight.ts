import { MOTION, reducedMotion } from '../motion.ts';
import { type Direction, landingOf } from '../triage.ts';

// How a decided card leaves the stage, on the motion tokens (slow, the shared easing):
// - into its tray: a copy of the card flies above everything (--z-flight) onto the tray's new entry,
//   shrinking to the entry's size, with at most a slight tilt; the entry fades in under it as it
//   lands, so the two never show at once;
// - where no tray is shown (narrow windows, a card left for later): a short slide and fade in the
//   move's direction;
// - under reduced motion: a crossfade.

export type Exit = Direction | 'skip';

export type Flight = { done: Promise<void>; cancel: () => void };

const TILT = 1.5;
const SLIDE = 48;
const RADIUS = { card: 12, slot: 8 };
// The share of the flight after which the copy fades into the entry.
const HAND_OVER = 0.7;

function ended(animation: Animation): Promise<void> {
  return animation.finished.then(
    () => undefined,
    () => undefined,
  );
}

// A copy of the card, fixed over where the card is, for the flight; the card itself is hidden so
// that the next card is seen rising behind it.
function copyOf(card: HTMLElement): HTMLElement {
  const box = card.getBoundingClientRect();
  const copy = card.cloneNode(true) as HTMLElement;
  for (const element of copy.querySelectorAll('[id]')) element.removeAttribute('id');
  copy.removeAttribute('aria-labelledby');
  copy.setAttribute('aria-hidden', 'true');
  copy.classList.add('tcard-flight');
  copy.style.left = `${box.left}px`;
  copy.style.top = `${box.top}px`;
  copy.style.width = `${box.width}px`;
  copy.style.height = `${box.height}px`;
  copy.style.transform = '';
  document.body.append(copy);
  return copy;
}

export function flyToSlot(card: HTMLElement, slot: HTMLElement, side: Direction): Flight {
  const from = card.getBoundingClientRect();
  const to = slot.getBoundingClientRect();
  const { dx, dy, scale, cut } = landingOf(from, to);
  const copy = copyOf(card);
  card.style.visibility = 'hidden';
  const tilt = side === 'right' ? TILT : -TILT;
  const flight = copy.animate(
    [
      {
        transform: 'translate(0px, 0px) scale(1) rotate(0deg)',
        clipPath: `inset(0px 0px 0px 0px round ${RADIUS.card}px)`,
        opacity: 1,
      },
      {
        offset: 0.5,
        transform: `translate(${dx / 2}px, ${dy / 2}px) scale(${(1 + scale) / 2}) rotate(${tilt}deg)`,
        clipPath: `inset(0px 0px ${cut / 2}px 0px round ${RADIUS.card}px)`,
        opacity: 1,
      },
      { offset: HAND_OVER, opacity: 1 },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`,
        clipPath: `inset(0px 0px ${cut}px 0px round ${RADIUS.slot / scale}px)`,
        opacity: 0,
      },
    ],
    { duration: MOTION.slow, easing: MOTION.ease, fill: 'forwards' },
  );
  // The entry is there all along, unseen; it takes over as the copy lands.
  const entry = slot.animate([{ opacity: 0 }, { opacity: 0, offset: HAND_OVER }, { opacity: 1 }], {
    duration: MOTION.slow,
    fill: 'forwards',
  });
  return {
    done: ended(flight).then(() => copy.remove()),
    cancel: () => {
      flight.cancel();
      entry.cancel();
      copy.remove();
      card.style.visibility = '';
    },
  };
}

export function slideOut(card: HTMLElement, exit: Exit): Flight {
  const from = card.style.transform || 'none';
  const to =
    exit === 'skip'
      ? 'translateY(16px)'
      : `translateX(${exit === 'right' ? SLIDE : -SLIDE}px) rotate(${exit === 'right' ? TILT : -TILT}deg)`;
  // It is gone by 40% of the slide, so it never lies over the next card for long.
  const animation = card.animate(
    [
      { transform: from, opacity: 1 },
      { offset: 0.4, opacity: 0 },
      { transform: to, opacity: 0 },
    ],
    { duration: MOTION.slow, easing: MOTION.ease, fill: 'forwards' },
  );
  return { done: ended(animation), cancel: () => animation.cancel() };
}

export function fadeOut(card: HTMLElement, slot: HTMLElement | null): Flight {
  const animation = card.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: MOTION.fast,
    fill: 'forwards',
  });
  const entry = slot?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: MOTION.fast,
    fill: 'forwards',
  });
  return {
    done: ended(animation),
    cancel: () => {
      animation.cancel();
      entry?.cancel();
    },
  };
}

// The way a card leaves: into its tray when the tray is on screen, else a slide; a fade under
// reduced motion.
export function leaveStage(card: HTMLElement, exit: Exit, slot: HTMLElement | null): Flight {
  const shown = slot !== null && slot.offsetParent !== null ? slot : null;
  if (reducedMotion()) return fadeOut(card, shown);
  if (shown && exit !== 'skip') return flyToSlot(card, shown, exit);
  return slideOut(card, exit);
}
