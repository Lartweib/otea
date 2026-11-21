import { t } from '../../i18n/i18n.ts';
import { GhostButton } from '../../kit/index.ts';

// The sheet of an item the server does not have (a mistyped or deleted id): the sheet's own bar and
// head, so it opens, swaps and closes as any item does, saying what was not found, with Cerrar.
// `offline`: the PC did not answer and nothing of the item was kept (TS-10): it opens once the PC
// answers again.
export function ItemMissing({
  id,
  phone,
  offline = false,
  onClose,
}: {
  id: string;
  phone: boolean;
  offline?: boolean;
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
          {t(offline ? 'sheet.unreached.title' : 'sheet.missing.title')}
        </h1>
        <div data-c>
          <p className="standfirst">
            {t(offline ? 'sheet.unreached.text' : 'sheet.missing.text', { id })}
          </p>
        </div>
      </div>
    </div>
  );
}
