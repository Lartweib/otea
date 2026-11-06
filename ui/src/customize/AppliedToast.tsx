import { useEffect } from 'react';
import { t } from '../i18n/i18n.ts';
import { announce, dismiss, useApplied } from './applied.ts';

const APPLIED_MS = 12_000;

export function AppliedToast({ onUndone }: { onUndone: () => void }) {
  const applied = useApplied();
  // It stays a while, or until the next thing the person does.
  useEffect(() => {
    if (!applied) return;
    const timer = setTimeout(dismiss, APPLIED_MS);
    const next = (event: Event) => {
      if (
        !(
          event.target instanceof Node &&
          document.querySelector('.cz-toast-app')?.contains(event.target)
        )
      )
        dismiss();
    };
    // Not for the click that brought the note: the page it lands on is already drawn.
    const arm = setTimeout(() => {
      document.addEventListener('pointerdown', next);
      document.addEventListener('keydown', next);
    }, 400);
    return () => {
      clearTimeout(timer);
      clearTimeout(arm);
      document.removeEventListener('pointerdown', next);
      document.removeEventListener('keydown', next);
    };
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
