import { t, tx } from '../i18n/i18n.ts';

// The command an agent runs to keep hearing the desk.
export const KEEP_WAITING = 'otea wait --turn agent --unclaimed';

// «Nadie está escuchando» where the person approves, sends back or answers, and on an item that
// waits for an agent: no agent waits in otea wait, so what is done here waits until one comes back.
// `className` places it: the sheet's acts, or the phone's dock.
export function Unheard({ className = 'said unheard' }: { className?: string }) {
  return (
    <p className={className} role="status" data-unheard="">
      {tx('listen.notice', {
        lead: <b>{t('listen.lead')}</b>,
        command: <code>{KEEP_WAITING}</code>,
      })}
    </p>
  );
}
