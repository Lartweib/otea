import { useCallback, useEffect, useRef, useState } from 'react';
import { reducedMotion } from '../motion.ts';

// A menu's life: it opens at once and plays its way in; closing plays its way out before it leaves
// the page (220ms, a 90ms fade under reduced motion), so the motion has something to run on.
export type MenuPhase = 'closed' | 'open' | 'closing';

const CLOSE_MS = 220;
const CLOSE_REDUCED_MS = 90;

export type Menu = {
  phase: MenuPhase;
  open: boolean;
  toggle: () => void;
  close: () => void;
  // The element that holds both the button and the menu: a press outside it closes the menu.
  ref: (element: HTMLElement | null) => void;
};

// One menu: a click outside it or Escape closes it.
export function useMenu(): Menu {
  const [phase, setPhase] = useState<MenuPhase>('closed');
  const holder = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    setPhase((current) => (current === 'open' ? 'closing' : current));
  }, []);
  const toggle = useCallback(() => {
    setPhase((current) => (current === 'open' ? 'closing' : 'open'));
  }, []);
  useEffect(() => {
    if (phase !== 'closing') return;
    const timer = setTimeout(
      () => setPhase((current) => (current === 'closing' ? 'closed' : current)),
      reducedMotion() ? CLOSE_REDUCED_MS : CLOSE_MS,
    );
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'open') return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element;
      // A sheet is drawn on the body and closes from its own scrim.
      if (target.closest?.('.sheet-layer')) return;
      if (holder.current && !holder.current.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [phase, close]);
  const ref = useCallback((element: HTMLElement | null) => {
    holder.current = element;
  }, []);
  return { phase, open: phase === 'open', toggle, close, ref };
}
