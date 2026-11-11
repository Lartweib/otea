import { t } from '../i18n/i18n.ts';
import { Button, Dialog } from '../kit/index.ts';
import { ChangeGlyph, Chevron } from './glyphs.tsx';
import type { ChangeKind } from './types.ts';

export type Change = { kind: ChangeKind; text: string };

export type ApplyDialogProps = {
  open: boolean;
  // The collection being shaped, e.g. "bugs".
  target: string;
  changes: readonly Change[];
  itemCount: number;
  // First time: the collection gets its own copy of the template.
  first?: boolean;
  // A template no board uses: the change is saved in the template, not applied to a board.
  save?: boolean;
  yaml: string;
  showFile: boolean;
  onToggleFile: () => void;
  onApply: () => void;
  onKeepEditing: () => void;
};

// What Apply does, before it does it: the changes, who they reach, and the file it writes. A kit
// Dialog (mock:3471-3495): the scrim, the line, the surface, then its items; Escape, the scrim and
// Keep editing close it, the same gesture mirrored.
export function ApplyDialog(p: ApplyDialogProps) {
  const title = p.save ? t('customize.saveTitle') : t('customize.applyTitle', { target: p.target });
  return (
    <Dialog open={p.open} label={title} onClose={p.onKeepEditing} className="cz-applyd">
      <h4 data-i="">{title}</h4>
      <ul className="cz-chg" data-i="">
        {p.changes.map((c) => (
          <li key={c.text} data-kind={c.kind}>
            <span className="cz-chgi">
              <ChangeGlyph kind={c.kind} />
            </span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      {p.save ? (
        <p className="cz-mp" data-i="">
          {t(p.first ? 'customize.saveCopy' : 'customize.saveOwn')}
        </p>
      ) : (
        <div data-i="">
          <p className="cz-who">
            <b>{t('customize.everyItem', { target: p.target })}</b> ·{' '}
            {t('customize.itemCount', { count: p.itemCount })}
          </p>
          <p className="cz-mp">{t('customize.reach')}</p>
          {p.first ? (
            <p className="cz-mp">{t('customize.firstCopy', { target: p.target })}</p>
          ) : null}
        </div>
      )}
      <button
        type="button"
        className="cz-seef"
        aria-expanded={p.showFile}
        onClick={p.onToggleFile}
        data-i=""
      >
        <Chevron />
        {t('customize.seeFile')}
      </button>
      {p.showFile ? <pre className="cz-yaml">{p.yaml}</pre> : null}
      <div className="dbtns" data-i="">
        <Button variant="quiet" onClick={p.onKeepEditing}>
          {t('customize.keepEditing')}
        </Button>
        <Button variant="primary" onClick={p.onApply}>
          {p.save ? t('cz.saveTemplate') : t('customize.apply', { target: p.target })}
        </Button>
      </div>
    </Dialog>
  );
}
