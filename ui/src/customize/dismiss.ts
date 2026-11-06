import { type RefObject, useEffect } from 'react';

// A popover closes on Esc and on a press outside it; the pure part is here so it can be tested.
export function shouldDismiss(
  event: { type: string; key?: string; target: unknown },
  inside: (target: unknown) => boolean,
): boolean {
  if (event.type === 'keydown') return event.key === 'Escape';
  return !inside(event.target);
}

// Focus moves into the popover when it opens, and Esc or a press outside closes it.
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    node.focus();
    const inside = (target: unknown) => target instanceof Node && node.contains(target);
    const on = (event: Event) => {
      if (shouldDismiss(event as KeyboardEvent, inside)) onClose();
    };
    document.addEventListener('keydown', on);
    document.addEventListener('pointerdown', on);
    return () => {
      document.removeEventListener('keydown', on);
      document.removeEventListener('pointerdown', on);
      previous?.focus?.();
    };
  }, [ref, onClose]);
}
