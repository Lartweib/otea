import type { TransportKind } from '../app/phone.ts';
import { isLoopback, isPrivateAddress, plainAddress } from './lan.ts';

// A phone transport as the server runs it: where a phone opens Otea, and which requests came
// through it. Whatever the transport, a phone that comes through it still pairs with a code and
// then carries its device token; the transport only opens a door, it never lets anyone in.

// What a request says about where it came from: its Host header, the socket's peer and, when a
// proxy on this computer forwarded it, the X-Forwarded-For header that proxy set.
export type Arrival = {
  host?: string | undefined;
  remote?: string | undefined;
  forwardedFor?: string | undefined;
};

// A request a transport admitted: the address its pairing attempts are counted by, and whether it
// came over HTTPS (the page's origin is then https://).
export type Admission = { address: string; secure: boolean };

export type PhoneTransport = {
  kind: TransportKind;
  // The base URLs a phone opens, best guess first.
  urls(port: number): string[];
  admit(arrival: Arrival, port: number): Admission | undefined;
};

// A request a proxy on this computer forwarded (tailscale serve, or any other): it comes from this
// computer but on someone else's behalf, so it is never this computer's own browser.
export function proxied(arrival: Arrival): boolean {
  return (
    arrival.remote !== undefined &&
    isLoopback(arrival.remote) &&
    (arrival.forwardedFor ?? '').trim() !== ''
  );
}

// The local network (otea serve --lan): a private address naming one of this computer's names or
// addresses, over plain HTTP.
export function lanTransport(hosts: readonly string[]): PhoneTransport {
  return {
    kind: 'lan',
    urls: (port) => hosts.map((host) => `http://${host}:${port}`),
    admit({ host, remote }, port) {
      if (remote === undefined || isLoopback(remote) || !isPrivateAddress(remote)) return undefined;
      const named = hosts.some((name) => host?.toLowerCase() === `${name.toLowerCase()}:${port}`);
      return named ? { address: plainAddress(remote), secure: false } : undefined;
    },
  };
}

// Tailscale's addresses: 100.64.0.0/10 (isPrivateAddress) and fd7a:115c:a1e0::/48.
function tailnetAddress(text: string | undefined): string | undefined {
  const first = plainAddress(text?.split(',')[0]?.trim() ?? '');
  if (/^fd7a:115c:a1e0:/i.test(first)) return first.toLowerCase();
  return /^100\./.test(first) && isPrivateAddress(first) ? first : undefined;
}

// Tailscale: `tailscale serve` terminates HTTPS for `https://<host>` and forwards to Otea on this
// computer, so what it forwards comes from this computer, naming the tailnet name (Tailscale keeps
// the Host header) and carrying the phone's tailnet address in X-Forwarded-For.
export function tailscaleTransport(tailnetHost: string): PhoneTransport {
  const name = tailnetHost.toLowerCase();
  return {
    kind: 'tailscale',
    urls: () => [`https://${name}`],
    admit(arrival) {
      const { host, remote, forwardedFor } = arrival;
      if (remote === undefined || !isLoopback(remote)) return undefined;
      const named = host?.toLowerCase() === name || host?.toLowerCase() === `${name}:443`;
      if (!named && !proxied(arrival)) return undefined;
      return { address: tailnetAddress(forwardedFor) ?? 'tailscale', secure: true };
    },
  };
}

// The Otea relay, a future paid service: the seam a relay plugs into. It opens nowhere yet.
export const relayTransport: PhoneTransport = {
  kind: 'relay',
  urls: () => [],
  admit: () => undefined,
};
