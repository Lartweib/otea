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

// On this computer's own browser Otea itself is down; on the phone, or anywhere else, it is the PC
// that does not answer.
export function downWords(host: string, phone = false): string {
  const local = !phone && (host === 'localhost' || host === '127.0.0.1' || host === '[::1]');
  return t(local ? 'offline.oteaDown' : 'offline.pcDown');
}

export type OfflineBarProps = { sync: SyncState; now: number; host: string; phone?: boolean };

export function OfflineBar({ sync, now, host, phone = false }: OfflineBarProps) {
  if (!sync.offline) return null;
  const synced =
    sync.syncedAt === null
      ? null
      : t('offline.synced', { time: syncedTime(sync.syncedAt, now, language()) });
  return (
    <div className="offline-bar" role="status">
      <span className="ob-dot" aria-hidden="true" />
      <span className="ob-text">
        <b>{downWords(host, phone)}</b>
        {synced === null ? null : (
          <>
            <span className="ob-sep"> · </span>
            <span className="ob-when">{synced}</span>
          </>
        )}
      </span>
      <span className="ob-ro">{t('offline.readOnly')}</span>
    </div>
  );
}
