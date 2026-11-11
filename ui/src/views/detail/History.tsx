import { useLayoutEffect, useRef } from 'react';
import { t } from '../../i18n/i18n.ts';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import type { HistoryLine } from './history.ts';

// History (SPEC §10.3, mock:638-649): one lane with dots, mono times, the words, any quote in italic
// serif, who under it. Events that arrive while the item is open resolve from the top.
export function History({ lines, id }: { lines: HistoryLine[]; id: string }) {
  const known = useRef<{ id: string; max: number } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const max = Math.max(0, ...lines.map((l) => l.id));
    const before = known.current;
    known.current = { id, max };
    if (!before || before.id !== id || reduced() || !list.current) return;
    for (const li of list.current.querySelectorAll<HTMLElement>('li[data-ev]')) {
      if (Number(li.dataset.ev) <= before.max) continue;
      li.animate(
        [
          { opacity: 0, transform: 'translateY(-4px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 380, delay: 200, easing: C.glide, fill: 'backwards' },
      );
    }
  });
  return (
    <div className="d-hist" data-c>
      <section className="d-sec hist" data-key="history">
        <div className="margin-label">
          {t('sheet.hist.title')}
          <span>{t('detail.events', { count: lines.length })}</span>
        </div>
        <ol className="tl" ref={list}>
          {lines.map((l) => (
            <li key={l.id} data-ev={l.id} className={l.dot === 'agent' ? undefined : l.dot}>
              <i className="dt" />
              <span className="tm">{l.when}</span>
              <span className="tx">
                {l.text}
                {l.quote ? <q>{l.quote}</q> : null}
                <small>{l.who}</small>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
