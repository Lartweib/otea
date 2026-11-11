import { C } from './motion/curves.ts';
import { reduced } from './motion/reduced.ts';
import { revealRadius } from './motion.ts';
import {
  readChoice,
  switchMotion,
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

// A switch in flight: one at a time, as in the mock (a press while the circle grows is ignored).
let running = false;

// The theme circle (mock:4074-4095, SPEC §7.3): the new theme grows from the pressed button's
// centre until it covers the window, 820 ms on settle, its edge feathered over 48 px by a mask
// driven through @property --r (a hard clip-path circle where masks cannot feather). Without View
// Transitions the colours crossfade 240 ms; under reduced motion, or when nothing on screen
// changes, the theme swaps at once. Returns false when a switch is still running and this one was
// not taken.
export function switchChoice(from: ThemeChoice, next: ThemeChoice, origin?: Element): boolean {
  if (running) return false;
  const root = document.documentElement;
  const mode = switchMotion(from, next, {
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    reduced: reduced() || !origin,
    transitions: typeof document.startViewTransition === 'function',
    mask: CSS.supports('mask-image', 'radial-gradient(circle, #000, transparent)'),
  });
  if (mode === 'instant') {
    // Nothing tweens its colours for two frames: the new theme is drawn whole, then they come back.
    root.classList.add('theme-switching');
    saveChoice(next);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!running) root.classList.remove('theme-switching');
      }),
    );
    return true;
  }
  if (mode === 'fade') {
    root.classList.add('theme-fade');
    saveChoice(next);
    window.setTimeout(() => root.classList.remove('theme-fade'), 300);
    return true;
  }
  const box = origin?.getBoundingClientRect();
  const x = box ? box.left + box.width / 2 : window.innerWidth / 2;
  const y = box ? box.top + box.height / 2 : 0;
  const r = revealRadius(x, y, window.innerWidth, window.innerHeight);
  running = true;
  root.classList.add('theme-switching');
  root.style.setProperty('--vx', `${x}px`);
  root.style.setProperty('--vy', `${y}px`);
  if (mode === 'mask') root.classList.add('vt-mask');
  const vt = document.startViewTransition(() => saveChoice(next));
  vt.ready
    .then(() => {
      const timing = {
        duration: 820,
        easing: C.settle,
        pseudoElement: '::view-transition-new(root)',
      };
      if (mode === 'mask') root.animate({ '--r': ['0px', `${r + 48}px`] }, timing);
      else {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          timing,
        );
      }
    })
    .catch(() => {});
  vt.finished
    .catch(() => {})
    .finally(() => {
      running = false;
      root.classList.remove('theme-switching', 'vt-mask');
    });
  return true;
}
