import { t, tx } from '../i18n/i18n.ts';
import { unheardWords } from '../listening.ts';

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

// The mark on a row nobody hears: «nadie está escuchando» as a warning, or, while an agent is at
// work on another item (`busy`), that it waits in the queue, in grey (P7-R2-12). It never gives
// way with an ellipsis, as the board name does (P8-R2-7).
export function UnheardMark({ busy }: { busy: readonly string[] }) {
  const { text, calm } = unheardWords(busy);
  return (
    <span className="mpt" data-unheard={calm ? 'calm' : ''}>
      <span className="sep">·</span>
      <span className={calm ? 'calm' : 'warn'}>{text}</span>
    </span>
  );
}
