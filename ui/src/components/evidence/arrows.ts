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
