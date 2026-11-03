import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/i18n.ts';
import { Button, Icon } from '../kit/index.ts';
import type { Menu } from './menu.ts';

type SheetProps = {
  menu: Menu;
  label: string;
  // The sheet's heading; the panel brings its own head instead.
  title?: ReactNode;
  // A bottom sheet (the phone's menus) or the panel from the left edge (the sidebar).
  side?: 'bottom' | 'left';
  children: ReactNode;
};

// On a phone a menu is a sheet over a scrim, in reach of a thumb; a tap on the scrim closes it. It
// is drawn on the body, so a sheet opened from the panel covers the screen, not the panel.
export function Sheet({ menu, label, title, side = 'bottom', children }: SheetProps) {
  if (menu.phase === 'closed' || typeof document === 'undefined') return null;
  return createPortal(
    <div className="sheet-layer" data-phase={menu.phase} data-side={side}>
      <div className="sheet-scrim" aria-hidden="true" onClick={menu.close} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        {side === 'bottom' ? <i className="sheet-grab" aria-hidden="true" /> : null}
        {title === undefined ? null : (
          <div className="sheet-head">
            <span className="t-h">{title}</span>
            <Button
              variant="quiet"
              size="sm"
              icon
              aria-label={t('common.close')}
              onClick={menu.close}
            >
              <Icon name="close" />
            </Button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
