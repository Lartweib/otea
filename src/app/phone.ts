import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import {
  checkTailscale,
  type Platform,
  type SetUpOptions,
  setUpTailscale,
  type TailscaleCheck,
  type TailscaleCli,
} from './tailscale.ts';

// How a phone reaches the desk: the phone transport. They are interchangeable; the pairing code,
// the device tokens and what a paired phone may do stay the same whichever carries it.
// - lan: the local network, plain HTTP to this computer's address (otea serve --lan). The default.
// - tailscale: `tailscale serve` gives this computer an HTTPS name on the person's tailnet,
//   `https://<machine>.<tailnet>.ts.net`, reachable from their own devices wherever they are.
// - relay: the Otea relay, a future service. Only the seam exists: choosing it is refused.
export const TRANSPORTS = ['lan', 'tailscale', 'relay'] as const;

export type TransportKind = (typeof TRANSPORTS)[number];

export type PhoneSettings = { transport: TransportKind; tailscaleHost: string | null };

export const RELAY_UNAVAILABLE =
  'The Otea relay is not available yet; use the local network (otea serve --lan) or Tailscale (otea phone tailscale)';

const DEFAULT: PhoneSettings = { transport: 'lan', tailscaleHost: null };

type PhoneRow = { transport: string; tailscale_host: string | null };

export function isTransport(value: string): value is TransportKind {
  return (TRANSPORTS as readonly string[]).includes(value);
}

export function phoneSettings(db: DatabaseSync): PhoneSettings {
  const row = db.prepare('SELECT transport, tailscale_host FROM phone').get() as
    | PhoneRow
    | undefined;
  if (!row || !isTransport(row.transport)) return DEFAULT;
  return { transport: row.transport, tailscaleHost: row.tailscale_host };
}

export function choosePhoneTransport(db: DatabaseSync, settings: PhoneSettings): PhoneSettings {
  if (settings.transport === 'relay')
    throw new OteaError('transport_unavailable', RELAY_UNAVAILABLE);
  if (settings.transport === 'tailscale' && !settings.tailscaleHost) {
    throw new OteaError(
      'transport_unavailable',
      'Tailscale needs the name this computer has on the tailnet; run otea phone tailscale',
    );
  }
  const host = settings.transport === 'tailscale' ? settings.tailscaleHost : null;
  db.prepare(
    `INSERT INTO phone (id, transport, tailscale_host) VALUES (1, ?, ?)
     ON CONFLICT (id) DO UPDATE SET transport = excluded.transport,
       tailscale_host = excluded.tailscale_host`,
  ).run(settings.transport, host);
  return { transport: settings.transport, tailscaleHost: host };
}

// Whether Otea answers at a URL, as a phone would reach it (a pairing-screen file, open to anyone
// the transport lets through).
export type Probe = (url: string) => Promise<boolean>;

const PROBE_TIMEOUT_MS = 3000;

export const fetchProbe: Probe = async (url) => {
  try {
    const response = await fetch(`${url}/manifest.webmanifest`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: 'manual',
    });
    return response.ok;
  } catch {
    return false;
  }
};

export type PhoneStatus = {
  transport: TransportKind;
  // The URL a phone opens on this transport; none while there is no address or Tailscale name.
  url: string | null;
  // Whether Otea answered there just now; null when there was nothing to try.
  reachable: boolean | null;
  // Where Tailscale stands, on Tailscale.
  tailscale: TailscaleCheck | null;
};

export type StatusSources = {
  port: number;
  // The URLs the local network offers (this computer's .local name and private addresses).
  lanUrls: readonly string[];
  tailscale: TailscaleCli;
  probe: Probe;
  platform?: Platform;
};

export async function phoneStatus(db: DatabaseSync, sources: StatusSources): Promise<PhoneStatus> {
  const settings = phoneSettings(db);
  if (settings.transport === 'tailscale' && settings.tailscaleHost) {
    const check = await checkTailscale(sources.tailscale, sources.port, sources.platform);
    const url = `https://${settings.tailscaleHost}`;
    const serving =
      check.state === 'ready' && check.serving && check.host === settings.tailscaleHost;
    return {
      transport: 'tailscale',
      url,
      reachable: serving ? await sources.probe(url) : false,
      tailscale: check,
    };
  }
  const url = sources.lanUrls[0] ?? null;
  return {
    transport: 'lan',
    url,
    reachable: url === null ? null : await sources.probe(url),
    tailscale: null,
  };
}

// Sets Tailscale up for Otea on this port and, once it is ready, makes it the phone transport.
export async function switchToTailscale(
  db: DatabaseSync,
  cli: TailscaleCli,
  port: number,
  options: SetUpOptions = {},
): Promise<TailscaleCheck> {
  const check = await setUpTailscale(cli, port, options);
  if (check.state === 'ready') {
    choosePhoneTransport(db, { transport: 'tailscale', tailscaleHost: check.host });
  }
  return check;
}
