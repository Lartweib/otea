import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { MOTION, reducedMotion } from '../motion.ts';

type UnfoldProps = {
  // false folds it away; onFolded runs once it is closed, so it can be dropped.
  open: boolean;
  onFolded: () => void;
  // The height it takes once settled, for the lanes drawn beside it.
  onHeight: (height: number) => void;
  children: ReactNode;
};

const ID = 'unfold';

// Animates the box from where it is now to a height; the rows below follow in the flow.
function slide(box: HTMLElement, to: number, fill: FillMode = 'none'): Animation | undefined {
  const from = box.getBoundingClientRect().height;
  for (const animation of box.getAnimations()) if (animation.id === ID) animation.cancel();
  box.style.height = '';
  if (reducedMotion() || from === to) return undefined;
  return box.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    id: ID,
    duration: MOTION.slow,
    easing: MOTION.ease,
    fill,
  });
}

// An item opened where it sits: the box grows to its content (and follows it as it loads), and shrinks
// back to nothing when it folds.
export function Unfold({ open, onFolded, onHeight, children }: UnfoldProps) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const report = useRef(onHeight);
  report.current = onHeight;
  const folded = useRef(onFolded);
  folded.current = onFolded;

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = content.current;
    if (!outer || !inner) return;
    if (!open) {
      const animation = slide(outer, 0, 'forwards');
      const done = () => {
        report.current(0);
        folded.current();
      };
      if (animation) animation.finished.then(done, () => undefined);
      else done();
      return;
    }
    let height = 0;
    // The first slide starts from nothing: the box is measured before it has any height of its own.
    outer.style.height = '0px';
    const follow = () => {
      const next = inner.offsetHeight;
      if (next === height) return;
      height = next;
      slide(outer, next);
      report.current(next);
    };
    follow();
    // Under reduced motion the box is there at once and its content crossfades in.
    inner.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      reducedMotion() ? { duration: MOTION.fast } : { duration: MOTION.base, easing: MOTION.ease },
    );
    const observer = new ResizeObserver(follow);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [open]);

  return (
    <div className="unfold" ref={box} data-open={open}>
      <div className="unfold-content" ref={content} inert={!open}>
        {children}
      </div>
    </div>
  );
}
