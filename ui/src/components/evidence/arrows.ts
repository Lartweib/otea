import type { KeyboardEvent } from 'react';
import { stepIndex } from '../../evidence.ts';

// Left and right step through a strip of thumbnails from anywhere inside it; when a thumbnail has
// the focus, the focus follows the step.
export function stepWithArrows(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  length: number,
  go: (to: number) => void,
): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const to = stepIndex(index, event.key === 'ArrowLeft' ? -1 : 1, length);
  go(to);
  const { target, currentTarget } = event;
  if (target instanceof HTMLElement && target.classList.contains('ev-thumb')) {
    currentTarget.querySelectorAll<HTMLElement>('.ev-thumb')[to]?.focus();
  }
}

// The file the reader steps to with ← or →, from where the focus is (P5-9); null when the key
// belongs to what has the focus (a text box, a slider, a strip that steps itself) or no file is
// that way. The reader does not wrap: «1 of 7» stays put on ←.
export function readerStep(
  key: string,
  target: { tagName?: string; role?: string | null; editable?: boolean },
  at: number,
  total: number,
): number | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  const tag = (target.tagName ?? '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || target.editable) return null;
  if (target.role === 'slider') return null;
  const to = at + (key === 'ArrowLeft' ? -1 : 1);
  return to >= 0 && to < total ? to : null;
}
