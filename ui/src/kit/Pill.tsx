import type { ReactNode } from 'react';

export type PillTone = 'default' | 'ask' | 'state';

type PillProps = {
  tone?: PillTone;
  // A state pill in your color: the state is waiting for you.
  yours?: boolean;
  // Small, to sit in a list row (the mock's pills have one size).
  size?: 'md' | 'sm';
  // The key, when the pill shows a preset's label for it.
  title?: string | undefined;
  children: ReactNode;
};

// Today's pill, drawn as the mock's: a state is a .stp-pill (tinted when yours, and an open
// question for you is tinted too), anything else an .enum on a well.
export function Pill({ tone = 'default', yours = false, title, children }: PillProps) {
  const classes =
    tone === 'default' ? 'enum' : tone === 'ask' || yours ? 'stp-pill you' : 'stp-pill';
  return (
    <span className={classes} title={title}>
      {children}
    </span>
  );
}
