import * as detail from '../detail/DetailHost.tsx';

// The detail slice's moveSplit() (SPEC §10.2): when the list's kind changes with the detail open,
// the sheet and the divider slide to the new edge. A no-op until the detail exports it.
export function moveSplit(): void {
  const fn = (detail as Record<string, unknown>).moveSplit;
  if (typeof fn === 'function') (fn as () => void)();
}
