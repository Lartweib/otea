import { type CSSProperties, useRef } from 'react';
import { t } from '../i18n/i18n.ts';
import { useDismiss } from './dismiss.ts';
import { Cross, Down, Up } from './glyphs.tsx';

export type BoxMenuProps = {
  name: string;
  onName: (name: string) => void;
  onClose: () => void;
  onUp: () => void;
  onDown: () => void;
  upDisabled?: boolean;
  downDisabled?: boolean;
  // Sits beside the previous box (half width) or takes the full width.
  beside: boolean;
  // The first box has nothing before it to sit beside.
  canBeside?: boolean;
  onBeside: (beside: boolean) => void;
  canRemove?: boolean;
  onRemove: () => void;
  style?: CSSProperties;
};

export function BoxMenu(p: BoxMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, p.onClose);
  return (
    <div
      ref={ref}
      className="cz-menu"
      role="dialog"
      aria-label={t('customize.box')}
      tabIndex={-1}
      style={p.style}
    >
      <div className="cz-mh">
        <input
          className="cz-in"
          type="text"
          aria-label={t('customize.rename')}
          value={p.name}
          onChange={(e) => p.onName(e.target.value)}
        />
        <button
          type="button"
          className="btn sm quiet cz-mx"
          aria-label={t('customize.close')}
          onClick={p.onClose}
        >
          <Cross />
        </button>
      </div>
      <div className="cz-mud">
        <button type="button" className="btn sm quiet" disabled={p.upDisabled} onClick={p.onUp}>
          <Up />
          {t('customize.moveUp')}
        </button>
        <button type="button" className="btn sm quiet" disabled={p.downDisabled} onClick={p.onDown}>
          <Down />
          {t('customize.moveDown')}
        </button>
      </div>
      <div className="cz-sg wrap">
        <button
          type="button"
          className={p.beside ? 'on' : ''}
          aria-pressed={p.beside}
          disabled={!p.canBeside}
          onClick={() => p.onBeside(true)}
        >
          {t('customize.besidePrevious')}
        </button>
        <button
          type="button"
          className={p.beside ? '' : 'on'}
          aria-pressed={!p.beside}
          onClick={() => p.onBeside(false)}
        >
          {t('customize.fullWidth')}
        </button>
      </div>
      {p.canRemove ? (
        <div className="cz-mfoot">
          <button type="button" className="btn sm quiet" onClick={p.onRemove}>
            {t('customize.removeBox')}
          </button>
          <p className="cz-mp">{t('customize.removeBoxSays')}</p>
        </div>
      ) : null}
    </div>
  );
}
