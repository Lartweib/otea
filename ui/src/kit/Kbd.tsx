import type { ReactNode } from 'react';

// Keyboard hint inside a button or a line of text.
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
