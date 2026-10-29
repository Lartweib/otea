import type { ReactNode } from 'react';

export type PillTone = 'default' | 'ask' | 'state';

type PillProps = {
  tone?: PillTone;
  // A state pill in your color: the state is waiting for you.
  yours?: boolean;
  // Small, to sit in a list row.
  size?: 'md' | 'sm';
  children: ReactNode;
};

// Mono tag. `ask` marks an open question for you; `state` names a workflow state.
export function Pill({ tone = 'default', yours = false, size = 'md', children }: PillProps) {
  const classes = [
    'pill',
    tone === 'default' ? '' : tone,
    tone === 'state' && yours ? 'you' : '',
    size === 'sm' ? 'sm' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{children}</span>;
}
