import type { ReactNode } from 'react';
import { t, tx } from '../../i18n/i18n.ts';
import { toast } from '../../kit/pop/toast.tsx';
import type { Place } from './arrange.ts';
import { placeName } from './GripMenu.tsx';

// The preview's toasts, each with Deshacer where the move can be undone. A second toast swaps its
// words in place (the kit's toast host).

export function arrangeToast(name: string, to: Place | 'unrow', undo: () => void): void {
  const b = <b>{name}</b>;
  const msg: ReactNode =
    to === 'row'
      ? tx('bs.preview.toast.row', { name: b })
      : to === 'unrow'
        ? tx('bs.preview.toast.unrow', { name: b })
        : to === 'hidden'
          ? tx('bs.preview.toast.hidden', { name: b })
          : tx('bs.preview.toast.zone', { name: b, zone: placeName(to) });
  toast({ msg, undo });
}

export function plainToast(msg: ReactNode, undo?: () => void): void {
  toast(undo ? { msg, undo } : { msg });
}

export const failedText = (reason: string): string => t('bs.preview.failed', { reason });
