import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { C } from '../motion/curves.ts';
import { reduced } from '../motion/reduced.ts';

export type SegOption<V extends string> = { value: V; label: ReactNode; icon?: ReactNode };

type SegProps<V extends string> = {
  value: V;
  options: readonly SegOption<V>[];
  onChange: (value: V, button: HTMLButtonElement) => void;
  label?: string;
  // On a well (Preferences), rather than on the sheet.
  well?: boolean;
  className?: string;
};

// The knob's pose under the button that is on.
function placeKnob(seg: HTMLElement, animate: boolean): void {
  const on = seg.querySelector<HTMLElement>(':scope > button.on');
  const k = seg.querySelector<HTMLElement>(':scope > .knob');
  if (!on || !k) return;
  const to = { transform: `translateX(${on.offsetLeft}px)`, width: `${on.offsetWidth}px` };
  const from = { transform: k.style.transform || to.transform, width: k.style.width || to.width };
  k.style.transform = to.transform;
  k.style.width = to.width;
  if (animate && !reduced() && from.transform !== to.transform) {
    k.animate([from, to], { duration: 360, easing: C.settle });
  }
}

// A segmented switch whose knob slides to the choice (mock:3399-3406): translateX and width,
// 360 settle. role=radiogroup, each option a radio.
export function Seg<V extends string>({
  value,
  options,
  onChange,
  label,
  well = false,
  className,
}: SegProps<V>) {
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the knob follows the value
  useLayoutEffect(() => {
    if (ref.current) placeKnob(ref.current, placed.current);
    placed.current = true;
  }, [value]);
  useLayoutEffect(() => {
    const seg = ref.current;
    if (!seg) return;
    const ro = new ResizeObserver(() => placeKnob(seg, false));
    ro.observe(seg);
    return () => ro.disconnect();
  }, []);
  const classes = ['seg2', well ? 'well' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <div ref={ref} className={classes} role="radiogroup" aria-label={label}>
      <i className="knob" aria-hidden="true" />
      {options.map((o) => (
        // biome-ignore lint/a11y/useSemanticElements: a segmented switch of buttons, as the mock draws it
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : undefined}
          onClick={(event) => onChange(o.value, event.currentTarget)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
