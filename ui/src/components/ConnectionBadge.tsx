import type { Connection } from '../hooks.ts';

const LABELS: Record<Connection, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
};

export function ConnectionBadge({ connection }: { connection: Connection }) {
  return (
    <output className="connection" data-connection={connection}>
      <span className="connection-dot" aria-hidden="true" />
      {LABELS[connection]}
    </output>
  );
}
