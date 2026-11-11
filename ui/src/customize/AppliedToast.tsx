import { useEffect } from 'react';
import { toast } from '../kit/index.ts';
import { appliedToast, dismiss, isClaimed, useApplied } from './applied.ts';

// The applied note on the page it lands on: the app's toast (mock:3423-3469), with Deshacer when
// the change can be taken back. A Customize page that claims it shows it in its own note instead.
export function AppliedToast({ onUndone }: { onUndone: () => void }) {
  const applied = useApplied();
  useEffect(() => {
    if (!applied || isClaimed()) return;
    toast(appliedToast(applied, onUndone));
    dismiss();
  }, [applied, onUndone]);
  return null;
}
