import { t, tx } from '../i18n/i18n.ts';
import { type Hearing, unheardWords } from '../listening.ts';

// The command an agent runs to keep hearing the desk.
export const KEEP_WAITING = 'otea wait --turn agent --unclaimed';

// «Nadie está escuchando» beside a move that hands the item to an agent, where the person answers,
// and on an item that waits for an agent: no agent waits in otea wait, so what is done here waits
// until one comes back. While agents are at work (`hearing`), it says calmly that they will see it
// when they wait again (P7-R2-9). `className` places it: the sheet's acts, or the phone's dock.
export function Unheard({
  className = 'said unheard',
  hearing = { kind: 'unheard' },
}: {
  className?: string;
  hearing?: Hearing;
}) {
  if (hearing.kind === 'working')
    return (
      <p className={className} role="status" data-unheard="calm">
        {t('listen.working', { count: hearing.agents.length, agent: hearing.agents[0] ?? '' })}
      </p>
    );
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

// In its place on a row an agent set aside for later: who did, in grey, for no agent is coming to
// it until it is taken up again (P7-R3-1).
export function SetAsideMark({ by }: { by: string }) {
  return (
    <span className="mpt" data-aside="">
      <span className="sep">·</span>
      <span className="calm">{t('listen.setAside', { agent: by })}</span>
    </span>
  );
}
