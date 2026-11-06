import { useEffect } from 'react';
import { t } from '../i18n/i18n.ts';
import { dismiss, useApplied } from './applied.ts';

export function AppliedToast({ onUndone }: { onUndone: () => void }) {
  const applied = useApplied();
  useEffect(() => {
    if (!applied) return;
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [applied]);
  if (!applied) return null;
  return (
    <div className="cz-toast cz-toast-app" role="status">
      {applied.text}
      <button
        type="button"
        onClick={() => {
          applied.undo().then(onUndone, () => undefined);
          dismiss();
        }}
      >
        {t('customize.undo')}
      </button>
    </div>
  );
}
