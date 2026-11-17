// The row under a box being typed in (its send button), brought above the phone's keyboard once
// the keyboard is up. Chrome scrolls only the box itself into view, so the button under it stayed
// half under the keys (DR3-15). Off a phone nothing moves: the row is already in view.

type Viewport = Pick<VisualViewport, 'addEventListener' | 'removeEventListener'>;

export function keepInView(
  row: Pick<Element, 'scrollIntoView'> | null,
  viewport: Viewport | null | undefined = typeof window === 'undefined'
    ? undefined
    : window.visualViewport,
  wait: (fn: () => void, ms: number) => () => void = (fn, ms) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
): () => void {
  if (!row) return () => {};
  const show = () => row.scrollIntoView({ block: 'nearest' });
  // The keyboard rises over a few frames: the viewport says when it has, and a late look covers
  // a phone whose viewport never says.
  viewport?.addEventListener('resize', show);
  const cancel = wait(show, 400);
  return () => {
    cancel();
    viewport?.removeEventListener('resize', show);
  };
}
