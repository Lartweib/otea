import type { ReactNode } from 'react';
import { BottomSheet } from '../phone/BottomSheet.tsx';
import type { Menu } from './menu.ts';

type SheetProps = {
  menu: Menu;
  label: string;
  // The sheet's heading, with a close button beside it.
  title?: ReactNode;
  children?: ReactNode;
};

// A menu as a phone's bottom sheet (SPEC §10.7): today's menus that still open one get the phone
// slice's BottomSheet, its Choreo and its drag. New code uses BottomSheet itself.
export function Sheet({ menu, label, title, children }: SheetProps) {
  return (
    <BottomSheet open={menu.phase === 'open'} label={label} title={title} onClose={menu.close}>
      {children}
    </BottomSheet>
  );
}
