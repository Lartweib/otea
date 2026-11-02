import type { Connection } from '../hooks.ts';
import { type PlainKey, t } from '../i18n/i18n.ts';

const LABELS: Record<Connection, PlainKey> = {
  connecting: 'connection.connecting',
  live: 'connection.live',
  reconnecting: 'connection.reconnecting',
};

// Filled when live, a still ring while (re)connecting. Nothing blinks.
export function ConnectionBadge({ connection }: { connection: Connection }) {
  return (
    <output className="connection" data-connection={connection}>
      <span className="connection-dot" aria-hidden="true" />
      <span className="connection-label">{t(LABELS[connection])}</span>
    </output>
  );
}
