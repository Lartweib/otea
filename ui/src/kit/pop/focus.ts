// Focus inside a pop or a dialog: they are portalled to the end of the document, so they take
// focus when they open (and hand it back on Escape), a menu moves by its arrows, and a dialog keeps
// Tab inside itself.

export const FOCUSABLE =
  '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The item a key moves to in a menu of n, from the one at i (-1: none); null for other keys.
export function menuStep(key: string, i: number, n: number): number | null {
  if (n === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return i < 0 ? 0 : (i + 1) % n;
    case 'ArrowUp':
      return i < 0 ? n - 1 : (i - 1 + n) % n;
    case 'Home':
      return 0;
    case 'End':
      return n - 1;
    default:
      return null;
  }
}

// Where Tab wraps to at the edges of n focusables, from the one at i; null to let the browser move.
export function tabStep(shift: boolean, i: number, n: number): number | null {
  if (n === 0) return null;
  if (shift) return i <= 0 ? n - 1 : null;
  return i < 0 || i >= n - 1 ? 0 : null;
}

const focusables = (root: HTMLElement): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(FOCUSABLE),
];

// Focuses the first focusable inside root, without scrolling.
export function focusFirst(root: HTMLElement): void {
  // A dialog may say where its focus starts; else its first focusable.
  const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(root)[0];
  first?.focus({ preventScroll: true });
}

// The arrows of a role=menu.
export function onMenuKey(root: HTMLElement, event: KeyboardEvent): void {
  const items = [
    ...root.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])',
    ),
  ];
  const next = menuStep(
    event.key,
    items.indexOf(document.activeElement as HTMLElement),
    items.length,
  );
  if (next === null) return;
  event.preventDefault();
  items[next]?.focus({ preventScroll: true });
}

// Tab kept inside a dialog.
export function onDialogTab(root: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const all = focusables(root);
  const next = tabStep(
    event.shiftKey,
    all.indexOf(document.activeElement as HTMLElement),
    all.length,
  );
  if (next === null) return;
  event.preventDefault();
  all[next]?.focus({ preventScroll: true });
}

// Where focus goes back when a pop, a dialog or a drawer closes. Each remembers what had focus
// when it opened; when that is gone (a menu item of a pop that closed on the way), the trigger of
// the last pop that closed takes it, so focus never falls to the page's body.
type Focusable = { isConnected: boolean; focus(options?: FocusOptions): void };

let lastTrigger: Focusable | null = null;

export function noteTrigger(el: Focusable | null): void {
  if (el) lastTrigger = el;
}

export function focusTarget(saved: Focusable | null): Focusable | null {
  if (saved?.isConnected) return saved;
  return lastTrigger?.isConnected ? lastTrigger : null;
}

export function returnFocus(saved: Focusable | null): void {
  focusTarget(saved)?.focus({ preventScroll: true });
}

type PressPage = {
  body: unknown;
  activeElement: unknown;
  addEventListener(type: 'pointerup', run: () => void, options: AddEventListenerOptions): void;
  removeEventListener(type: 'pointerup', run: () => void, options: EventListenerOptions): void;
};

// A press outside closes a pop on its way down, and the browser then moves focus to what was
// pressed: the page's body when that takes no focus. Once the press ends, focus left on the body
// goes back to the pop's trigger; focus on what was pressed (a field, a button) stays there.
export function focusBackAfterPress(doc: PressPage, trigger: Focusable | null): void {
  const up = () => {
    doc.removeEventListener('pointerup', up, { capture: true });
    if (doc.activeElement === doc.body) returnFocus(trigger);
  };
  doc.addEventListener('pointerup', up, { capture: true });
}
