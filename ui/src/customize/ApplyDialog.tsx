import { useRef } from 'react';
import { t } from '../i18n/i18n.ts';
import { useDismiss } from './dismiss.ts';
import { ChangeGlyph, Chevron } from './glyphs.tsx';
import type { ChangeKind } from './types.ts';

export type Change = { kind: ChangeKind; text: string };

export type ApplyDialogProps = {
  // The collection being shaped, e.g. "bugs".
  target: string;
  changes: readonly Change[];
  itemCount: number;
  // First time: the collection gets its own copy of the template.
  first?: boolean;
  yaml: string;
  showFile: boolean;
  onToggleFile: () => void;
  onApply: () => void;
  onKeepEditing: () => void;
};

export function ApplyDialog(p: ApplyDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, p.onKeepEditing);
  const title = t('customize.applyTitle', { target: p.target });
  return (
    <div className="cz-scrim">
      <div ref={ref} className="cz-dlg" role="dialog" aria-label={title} tabIndex={-1}>
        <h2>{title}</h2>
        <ul className="cz-chg">
          {p.changes.map((c, i) => (
            <li key={`${i}-${c.text}`} data-kind={c.kind}>
              <span className="cz-chgi">
                <ChangeGlyph kind={c.kind} />
              </span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
        <p className="cz-who">
          <b>{t('customize.everyItem', { target: p.target })}</b> ·{' '}
          {t('customize.itemCount', { count: p.itemCount })}
        </p>
        <p className="cz-mp">{t('customize.reach')}</p>
        {p.first ? <p className="cz-mp">{t('customize.firstCopy', { target: p.target })}</p> : null}
        <button
          type="button"
          className="cz-seef"
          aria-expanded={p.showFile}
          onClick={p.onToggleFile}
        >
          <Chevron />
          {t('customize.seeFile')}
        </button>
        {p.showFile ? <pre className="cz-yaml">{p.yaml}</pre> : null}
        <div className="cz-dlga">
          <button type="button" className="btn primary" onClick={p.onApply}>
            {t('customize.apply', { target: p.target })}
          </button>
          <button type="button" className="btn quiet" onClick={p.onKeepEditing}>
            {t('customize.keepEditing')}
          </button>
        </div>
      </div>
    </div>
  );
}
