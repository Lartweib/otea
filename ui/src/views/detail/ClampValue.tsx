import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../i18n/i18n.ts';

// A field's value in a details cell: wrapped, held to a few lines, and when that cuts it, a "ver
// todo" that opens the cell across the whole row (DR-6: the person's own request was cut to one
// line in a 165 px cell, with no way to read the rest).
export function ClampValue({ children }: { children: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || open) return;
    const measure = () =>
      setCut(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [open]);
  return (
    <span className="dv-wrap" data-open={open ? 'true' : undefined}>
      <span ref={box} className="dv-clamp">
        {children}
      </span>
      {cut || open ? (
        <button
          type="button"
          className="lnk dv-more"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? t('sheet.d.lessValue') : t('sheet.d.allValue')}
        </button>
      ) : null}
    </span>
  );
}
