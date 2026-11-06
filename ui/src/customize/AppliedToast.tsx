import { useEffect } from 'react';
import { t } from '../i18n/i18n.ts';
import { announce, dismiss, useApplied } from './applied.ts';

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
      {applied.undo ? (
        <button
          type="button"
          onClick={() => {
            applied.undo?.().then(
              () => {
                onUndone();
                announce(t('cz.undone'));
              },
              () => announce(t('cz.failed')),
            );
          }}
        >
          {t('cz.undo')}
        </button>
      ) : null}
    </div>
  );
}
