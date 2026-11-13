import { useLayoutEffect, useRef } from 'react';
import { t } from '../../i18n/i18n.ts';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { type Trace, tracePath } from '../toca/trace.ts';

// An agent's last two hours as a line (SPEC §8.2, mock:1918-1985; agents mock §3): high while it
// works, low while it waits, a blue drop at each handoff to you, a dotted warn tail while quiet.
// Drawn imperatively: when it changes its shape, its tail extends (680 ink) and a new drop grows
// (420 settle), mock:1972-1977.
export function TraceSvg({ name, trace }: { name: string; trace: Trace }) {
  const svg = useRef<SVGSVGElement>(null);
  const markup = tracePath(trace, 560);
  const shape = `${trace.work.length}|${trace.handed.length}|${trace.quiet ? 1 : 0}`;
  const was = useRef<{ shape: string; drops: number } | null>(null);
  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    const before = was.current;
    was.current = { shape, drops: trace.handed.length };
    if (!before || before.shape === shape || reduced()) return;
    const tail = el.querySelector<SVGPathElement>('.tr');
    if (tail?.getTotalLength) {
      const L = tail.getTotalLength();
      tail.animate([{ strokeDasharray: `${L * 0.86} ${L}` }, { strokeDasharray: `${L} ${L}` }], {
        duration: 680,
        easing: C.ink,
      });
    }
    const drops = el.querySelectorAll('.drop');
    if (drops.length > before.drops) {
      drops[drops.length - 1]?.animate([{ r: '0' }, { r: '2.3' }], {
        duration: 420,
        easing: C.settle,
        delay: 400,
        fill: 'backwards',
      });
    }
  }, [shape, trace.handed.length]);
  return (
    <svg
      ref={svg}
      className="trace"
      viewBox="0 0 560 24"
      preserveAspectRatio="none"
      role="img"
      aria-label={t('toca.agent.trace', { agent: name })}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the trace's markup is built from numbers
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
