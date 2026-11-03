import { reducedMotion, TIMING } from '../motion.ts';

// Create lifts the row the form drew as you typed and sets it down on its lane in the list (the turn
// change's family: lift, carry, set down, on its 680ms clock). The new row is there all along under
// the copy, unseen, and takes over as the copy lands. Without the row in view (another collection is
// listed, a phone, reduced motion) there is no flight.

const WAIT_MS = 1500;
const LIFT = 1.025;
const HOP = 18;
const HAND_OVER = 0.82;

function rowOf(id: string): HTMLElement | null {
  const key = CSS.escape(id);
  return document.querySelector<HTMLElement>(
    `.item-list li[data-flip="${key}"] > .row, tr[data-flip="${key}"]`,
  );
}

// The new row, once the live list has it.
function rowAppears(id: string, signal: AbortSignal): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const until = performance.now() + WAIT_MS;
    const look = () => {
      if (signal.aborted) return resolve(null);
      const row = rowOf(id);
      if (row) return resolve(row);
      if (performance.now() > until) return resolve(null);
      requestAnimationFrame(look);
    };
    look();
  });
}

function inView(box: DOMRect): boolean {
  return box.bottom > 0 && box.top < window.innerHeight && box.width > 0;
}

function copyOf(strip: HTMLElement, box: DOMRect): HTMLElement {
  const copy = strip.cloneNode(true) as HTMLElement;
  for (const element of copy.querySelectorAll('[id]')) element.removeAttribute('id');
  copy.setAttribute('aria-hidden', 'true');
  copy.classList.add('lands-flight');
  Object.assign(copy.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
  document.body.append(copy);
  return copy;
}

export async function carryToList(strip: HTMLElement, id: string, signal: AbortSignal) {
  if (reducedMotion()) return;
  const row = await rowAppears(id, signal);
  const from = strip.getBoundingClientRect();
  if (!row || signal.aborted) return;
  const to = row.getBoundingClientRect();
  if (!inView(to) || !inView(from)) return;
  const copy = copyOf(strip, from);
  strip.dataset.vacant = '';
  const dx = to.left - from.left;
  const dy = to.top - from.top + (to.height - from.height) / 2;
  // The copy takes the row's width as it travels (its text is never stretched).
  const w0 = `${from.width}px`;
  const w1 = `${to.width}px`;
  const mid = `${from.width + (to.width - from.width) * 0.45}px`;
  const { duration, easing } = TIMING.travel;
  const flight = copy.animate(
    [
      { transform: 'translate(0, 0) scale(1)', width: w0, opacity: 1 },
      { offset: 0.12, transform: `translate(0, -2px) scale(${LIFT})`, width: w0, opacity: 1 },
      {
        offset: 0.45,
        transform: `translate(${dx * 0.45}px, ${dy * 0.22 - HOP}px) scale(${LIFT})`,
        width: mid,
        opacity: 1,
      },
      {
        offset: HAND_OVER,
        transform: `translate(${dx}px, ${dy}px) scale(1)`,
        width: w1,
        opacity: 1,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, width: w1, opacity: 0 },
    ],
    { duration, easing, fill: 'forwards' },
  );
  const entry = row.animate([{ opacity: 0 }, { opacity: 0, offset: HAND_OVER }, { opacity: 1 }], {
    duration,
  });
  const stop = () => {
    flight.cancel();
    entry.cancel();
  };
  signal.addEventListener('abort', stop, { once: true });
  await flight.finished.catch(() => undefined);
  signal.removeEventListener('abort', stop);
  copy.remove();
}
