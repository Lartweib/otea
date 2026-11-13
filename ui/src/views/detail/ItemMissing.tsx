import { t } from '../../i18n/i18n.ts';
import { GhostButton } from '../../kit/index.ts';

// The sheet of an item the server does not have (a mistyped or deleted id): the sheet's own bar and
// head, so it opens, swaps and closes as any item does, saying what was not found, with Cerrar.
export function ItemMissing({
  id,
  phone,
  onClose,
}: {
  id: string;
  phone: boolean;
  onClose: () => void;
}) {
  return (
    <div className="d-grid">
      <div className="sheet-bar" data-c>
        <div className="crumb">
          <span className="id">{id}</span>
        </div>
        <div className="bar-r">
          <GhostButton className="closeb" onClick={onClose}>
            {phone ? t('sheet.back') : t('sheet.close')}
          </GhostButton>
        </div>
      </div>
      <div className="d-head">
        <h1 className="headline" data-c>
          {t('sheet.missing.title')}
        </h1>
        <div data-c>
          <p className="standfirst">{t('sheet.missing.text', { id })}</p>
        </div>
      </div>
    </div>
  );
}
