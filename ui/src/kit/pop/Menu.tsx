import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import { reduced } from '../../motion/reduced.ts';
import { usePop } from './Pop.tsx';

// The pieces of a menu (mock:701-713). Every one resolves as the pop opens (data-i).

export function MenuLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="plabel" data-i="">
      <span>{children}</span>
      {aside}
    </div>
  );
}

export function MenuRule() {
  return <div className="prule" data-i="" />;
}

export function MenuNote({ children }: { children: ReactNode }) {
  return (
    <p className="pnote" data-i="">
      {children}
    </p>
  );
}

type MenuItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  // The current choice.
  on?: boolean;
  // A choice that toggles (a tick mark), and stays open.
  check?: boolean;
  // A small line on the right: a count, a hint.
  small?: ReactNode;
  // Picked: the choice shows first, the menu closes 120 ms later, then this runs (mock:3318-3323).
  onPick?: () => void;
  // Or a plain click that keeps the menu open.
  onClick?: () => void;
  children: ReactNode;
};

export function MenuItem({
  on = false,
  check = false,
  small,
  onPick,
  onClick,
  className,
  children,
  ...rest
}: MenuItemProps) {
  const pop = usePop();
  const [picked, setPicked] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = check ? on : on || picked;
  const classes = ['mi', shown ? 'on' : '', check ? 'check' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const click = () => {
    if (onClick) onClick();
    if (!onPick) return;
    if (!check) setPicked(true);
    timer.current = window.setTimeout(
      () => {
        pop.close();
        onPick();
      },
      reduced() ? 0 : 120,
    );
  };
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-checked goes with the checkbox role only
    <button
      type="button"
      className={classes}
      role={check ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={check ? on : undefined}
      data-i=""
      onClick={click}
      {...rest}
    >
      {check ? <span className="ckm">{on ? '✓' : ''}</span> : null}
      <span className={check ? 'lbx' : undefined}>{children}</span>
      {small !== undefined ? <small>{small}</small> : null}
    </button>
  );
}
