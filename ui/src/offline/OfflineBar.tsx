import { language, t } from '../i18n/i18n.ts';
import type { SyncState } from './sync-state.ts';

// The line under the top bar while the PC does not answer: what is on screen is the last the app
// saw, read-only, and since when. Gone with the next answer from the PC.

// The time of the last sync: its hour alone when it was today, with its day otherwise.
export function syncedTime(at: number, now: number, lang: string): string {
  const day = (ms: number) => new Date(ms).toDateString();
  const time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  const options: Intl.DateTimeFormatOptions =
    day(at) === day(now) ? time : { ...time, day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(lang, options).format(at);
}

// What the line says. On this computer's own browser Otea itself is down. Anywhere else the app
// cannot reach the PC, and it asks the two things that cause it nearly every time: through Tailscale
// (a *.ts.net origin), whether Tailscale is connected on this phone, the everyday case of a phone set
// up once and left with Tailscale off; on the local network, whether it is on the same wifi; and, in
// both, whether Otea is open on the PC.
export type DownWords = { head: string; ask: string | null };

export function downWords(host: string, phone = false): DownWords {
  const name = host.toLowerCase();
  const local = !phone && (name === 'localhost' || name === '127.0.0.1' || name === '[::1]');
  if (local) return { head: t('offline.oteaDown'), ask: null };
  const tailscale = name === 'ts.net' || name.endsWith('.ts.net');
  return {
    head: t('offline.noReach'),
    ask: t(tailscale ? 'offline.askTailscale' : 'offline.askLan'),
  };
}

export type OfflineBarProps = {
  sync: SyncState;
  now: number;
  host: string;
  phone?: boolean;
  // Tries the PC again now: the live stream and every read.
  onRetry?: () => void;
};

export function OfflineBar({ sync, now, host, phone = false, onRetry }: OfflineBarProps) {
  if (!sync.offline) return null;
  const synced =
    sync.syncedAt === null
      ? null
      : t('offline.synced', { time: syncedTime(sync.syncedAt, now, language()) });
  const words = downWords(host, phone);
  return (
    <div className="offline-bar" role="status" data-ask={words.ask === null ? undefined : ''}>
      <span className="ob-dot" aria-hidden="true" />
      <span className="ob-text">
        <b>{words.head}</b>
        {words.ask === null ? null : <span className="ob-ask"> {words.ask}</span>}
        {synced === null ? null : (
          <>
            <span className="ob-sep"> · </span>
            <span className="ob-when">{synced}</span>
          </>
        )}
      </span>
      <span className="ob-ro">{t('offline.readOnly')}</span>
      {onRetry ? (
        <button type="button" className="ob-retry" onClick={onRetry}>
          {t('offline.retry')}
        </button>
      ) : null}
    </div>
  );
}
