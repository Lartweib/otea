import { useEffect, useLayoutEffect, useRef } from 'react';
import { C, clamp } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { cardKey, cardOf, useEditor } from './context.ts';
import { AboutCard, AnyCard, DoneCard, FormCard } from './OtherCards.tsx';
import { StepCard } from './StepCard.tsx';

// The card of the selected stop (mock renderCard): a hairline leads from the stop's label across
// the card's top edge, then the content resolves in place. A «¿por qué está aquí?» from the preview
// (or a problem's Ir) brings it into view and flashes the row it points at.
export function Card() {
  const { draft } = useEditor();
  const def = draft.def;
  const sel = cardOf(def, draft.selection);
  const key = `${draft.record.id}:${cardKey(sel)}`;
  const card = useRef<HTMLElement>(null);
  const shown = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when another card shows
  useLayoutEffect(() => {
    const el = card.current;
    const was = shown.current;
    shown.current = key;
    if (!el || was === null || was === key || reduced()) return;
    const line = el.querySelector<HTMLElement>(':scope > .se-cline');
    const lab = document.querySelector<HTMLElement>(
      `.se-stoplab[data-board="${CSS.escape(draft.record.id)}"][data-key="${CSS.escape(cardKey(sel))}"]`,
    );
    if (line) {
      const cr = el.getBoundingClientRect();
      const lr = lab?.getBoundingClientRect();
      line.style.transformOrigin = lr?.width
        ? `${clamp(lr.left + lr.width / 2 - cr.left, 0, cr.width)}px 0`
        : '50% 0';
      line.animate(
        [
          { transform: 'scaleX(0.001)', opacity: 1 },
          { transform: 'scaleX(1)', opacity: 1 },
          { transform: 'scaleX(1)', opacity: 0 },
        ],
        { duration: 900, easing: C.glide },
      );
    }
    for (const [i, c] of [
      ...el.querySelectorAll<HTMLElement>(':scope > .se-card-in > *'),
    ].entries())
      c.animate(
        [
          { opacity: 0, transform: 'translateY(5px)', filter: 'blur(1px)' },
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        ],
        { duration: 380, delay: 90 + 34 * Math.min(i, 8), easing: C.glide, fill: 'backwards' },
      );
  }, [key]);

  // «¿Por qué está aquí?» and Ir: the card comes into view, the row it means flashes.
  const seen = useRef(draft.revealed);
  useEffect(() => {
    if (draft.revealed === seen.current) return;
    seen.current = draft.revealed;
    const at = draft.selection;
    window.requestAnimationFrame(() => {
      const row =
        at.kind === 'part'
          ? document.querySelector<HTMLElement>(`.se-hrow[data-row="${CSS.escape(at.id)}"]`)
          : null;
      const target = row ?? card.current;
      target?.scrollIntoView({
        behavior: reduced() ? 'auto' : 'smooth',
        block: row ? 'center' : 'start',
      });
      if (row) {
        row.classList.remove('flash');
        void row.offsetWidth;
        row.classList.add('flash');
      }
    });
  }, [draft.revealed, draft.selection]);

  let body = null;
  if (sel.kind === 'step') {
    const step = def.steps.find((s) => s.id === sel.id);
    body = step ? <StepCard key={step.id} step={step} /> : null;
  } else if (sel.kind === 'form') body = <FormCard />;
  else if (sel.kind === 'done') body = <DoneCard />;
  else if (sel.kind === 'about') body = <AboutCard />;
  else body = <AnyCard />;

  return (
    <section className="se-card" ref={card}>
      <i className="se-cline" />
      <div className="se-card-in" key={key}>
        {body}
      </div>
    </section>
  );
}
