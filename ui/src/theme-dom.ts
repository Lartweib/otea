import { reducedMotion, revealRadius, TIMING } from './motion.ts';
import {
  readChoice,
  shownChanges,
  type ThemeChoice,
  type ThemeStorage,
  writeChoice,
} from './theme.ts';

// Reading window.localStorage itself can throw when site data is blocked.
function browserStorage(): ThemeStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// System is the default: no attribute, the stylesheet follows prefers-color-scheme.
export function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function loadChoice(): ThemeChoice {
  return readChoice(browserStorage());
}

export function saveChoice(choice: ThemeChoice): void {
  writeChoice(browserStorage(), choice);
  applyChoice(choice);
}

// The switch in flight, and the choice the page should end on: a late update callback of a skipped
// switch applies the latest choice, never its own.
let running: ViewTransition | undefined;
let wanted: ThemeChoice = 'system';

// The new theme opens as a circle from the toggle's centre until it covers the window, on the turn
// change's clock. It runs only when the theme on screen changes; without View Transitions the theme
// changes at once. Under reduced motion the two snapshots crossfade (tokens.css).
export function switchChoice(from: ThemeChoice, next: ThemeChoice, origin?: Element): void {
  wanted = next;
  running?.skipTransition();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (
    typeof document.startViewTransition !== 'function' ||
    !shownChanges(from, next, prefersDark)
  ) {
    saveChoice(next);
    return;
  }
  const root = document.documentElement;
  // Nothing tweens its colours inside the new snapshot.
  root.setAttribute('data-theme-switching', '');
  const transition = document.startViewTransition(() => saveChoice(wanted));
  running = transition;
  transition.ready
    .then(() => {
      if (reducedMotion()) return;
      const box = origin?.getBoundingClientRect();
      const x = box ? box.left + box.width / 2 : window.innerWidth / 2;
      const y = box ? box.top + box.height / 2 : 0;
      const r = revealRadius(x, y, window.innerWidth, window.innerHeight);
      root.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { ...TIMING.travel, pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
  transition.finished
    .catch(() => {})
    .finally(() => {
      if (running === transition) running = undefined;
      if (!running) root.removeAttribute('data-theme-switching');
    });
}
