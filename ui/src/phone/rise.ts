import { useLayoutEffect, useRef, useState } from 'react';
import { Choreo, part } from '../motion/choreo.ts';

// The bottom buttons' entrance (SPEC §10.7): each rises in with the page that has it and sinks
// away, mirrored, when an item, the new item page, the activity drawer or another view takes the
// screen. It stays mounted while it sinks.
export function useRise<T extends HTMLElement>(show: boolean) {
  const [mounted, setMounted] = useState(show);
  const ref = useRef<T>(null);
  const choreo = useRef<Choreo | null>(null);
  if (show && !mounted) setMounted(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on show, hide and mount
  useLayoutEffect(() => {
    const b = ref.current;
    if (!b) return;
    if (!choreo.current)
      choreo.current = new Choreo([
        part(b, { opacity: 0 }, { opacity: 1 }, 240, 'drift', 0),
        part(
          b,
          { transform: 'translateY(14px) scale(0.96)' },
          { transform: 'translateY(0px) scale(1)' },
          440,
          'settle',
          0,
        ),
      ]);
    const ch = choreo.current;
    if (show) ch.go(1);
    else
      ch.go(0).then((latest) => {
        if (latest && ch.dir === 0) {
          choreo.current = null;
          setMounted(false);
        }
      });
  }, [show, mounted]);

  return { mounted, ref };
}
