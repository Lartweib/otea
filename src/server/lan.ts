import { randomInt } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { hostname, networkInterfaces } from 'node:os';
import { sameToken } from './token.ts';

// LAN access (otea serve --lan): the server listens on every interface, and a request that does not
// come from this computer gets past the door only with a device token, earned once with a pairing
// code shown on the desk. Everything here is the policy; server.ts applies it.

function octets(ip: string): number[] | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4) return undefined;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  return numbers.every((n) => n >= 0 && n <= 255) ? numbers : undefined;
}

// Node reports IPv4 peers on a dual-stack socket as IPv4-mapped IPv6 addresses.
export function plainAddress(address: string): string {
  return address.startsWith('::ffff:') && octets(address.slice(7)) ? address.slice(7) : address;
}

export function isLoopback(address: string): boolean {
  const ip = plainAddress(address);
  return ip === '::1' || octets(ip)?.[0] === 127;
}

// The networks a phone on the same network (or on a Tailscale tailnet) reaches the desk from:
// private ranges, CGNAT (Tailscale's 100.64.0.0/10) and link-local. Nothing public.
export function isPrivateAddress(address: string): boolean {
  const ip = octets(plainAddress(address));
  if (!ip) return false;
  const [a = -1, b = -1] = ip;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254)
  );
}

// Virtual adapters (VirtualBox, VMware, Hyper-V and WSL, Docker) no phone can reach.
const VIRTUAL = /vethernet|virtual|vbox|vmware|docker|wsl|hyper-v|^br-|^virbr|^veth|^vmnet/i;

// Wi-Fi and wired networks first, virtual adapters last (VirtualBox's host-only 192.168.56.0/24
// often hides behind a plain name); then home ranges before office ones, Tailscale after them.
export function rankAddress(name: string, address: string): number {
  const [a = 0, b = 0, c = 0] = octets(address) ?? [];
  const virtual = VIRTUAL.test(name) || (a === 192 && b === 168 && c === 56);
  const wireless = /wi-?fi|wlan|wireless/i.test(name);
  const range = a === 192 ? 0 : a === 10 ? 1 : a === 100 ? 2 : a === 172 ? 3 : 4;
  return (virtual ? 20 : wireless ? 0 : 10) + range;
}

// This computer's addresses on its networks, the hosts a paired device may name, best guess first.
export function lanAddresses(): string[] {
  return Object.entries(networkInterfaces())
    .flatMap(([name, infos = []]) =>
      infos
        .filter(
          (info) => info.family === 'IPv4' && !info.internal && isPrivateAddress(info.address),
        )
        .map((info) => ({ address: info.address, rank: rankAddress(name, info.address) })),
    )
    .sort((x, y) => x.rank - y.rank)
    .map(({ address }) => address);
}

// This computer's mDNS name, `<hostname>.local`, lower case; none for a hostname that is not one
// DNS label (macOS already ends it in .local).
export function localNameOf(host: string): string | undefined {
  const label = host.toLowerCase().replace(/\.local$/, '');
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ? `${label}.local` : undefined;
}

export type Resolve = (name: string) => Promise<string[]>;

const resolveIPv4: Resolve = async (name) =>
  (await lookup(name, { all: true, family: 4 })).map(({ address }) => address);

// The .local name a phone can use instead of an IP that DHCP may change: kept only when it resolves
// (here, through the system's mDNS) to one of the addresses LAN access answers on. Gives up quietly
// after `timeoutMs`.
export async function localName(
  addresses: readonly string[],
  { host = hostname(), resolve = resolveIPv4, timeoutMs = 1500 } = {},
): Promise<string | undefined> {
  const name = localNameOf(host);
  if (!name || addresses.length === 0) return undefined;
  const timeout = new Promise<string[]>((done) => setTimeout(() => done([]), timeoutMs).unref());
  const resolved = await Promise.race([resolve(name).catch(() => []), timeout]);
  return resolved.some((address) => addresses.includes(address)) ? name : undefined;
}

export const CODE_TTL_MS = 10 * 60 * 1000;
// Wrong codes the current one survives; then it is thrown away and the desk shows a new one.
export const MAX_WRONG_CODES = 5;
// Pairing attempts one address may make per window, right or wrong.
export const MAX_ATTEMPTS = 10;
export const ATTEMPT_WINDOW_MS = 60 * 1000;

// No 0/O or 1/I: the code is read off a screen and typed on a phone.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export type PairingCode = { code: string; expiresAt: number };

export type Redeemed = 'ok' | 'expired' | 'wrong';

export type Clock = () => number;

// One code at a time: issuing a new one replaces the old, a right code is used up at once, and
// MAX_WRONG_CODES wrong ones burn it.
export class PairingCodes {
  #current: PairingCode | undefined;
  #wrong = 0;
  readonly #now: Clock;

  constructor(now: Clock = Date.now) {
    this.#now = now;
  }

  issue(): PairingCode {
    let code = '';
    for (let index = 0; index < CODE_LENGTH; index += 1)
      code += ALPHABET[randomInt(ALPHABET.length)];
    this.#current = { code, expiresAt: this.#now() + CODE_TTL_MS };
    this.#wrong = 0;
    return this.#current;
  }

  // The code the desk shows, while it is still good.
  current(): PairingCode | undefined {
    const current = this.#current;
    return current && current.expiresAt > this.#now() ? current : undefined;
  }

  // Checks a code without using it up (the phone shows what it is about to pair with).
  check(given: string): Redeemed {
    const current = this.#current;
    if (!current || !sameToken(normalizeCode(given), current.code)) {
      this.#wrong += 1;
      if (this.#wrong >= MAX_WRONG_CODES) this.#current = undefined;
      return 'wrong';
    }
    return current.expiresAt > this.#now() ? 'ok' : 'expired';
  }

  redeem(given: string): Redeemed {
    const result = this.check(given);
    if (result !== 'wrong') this.#current = undefined;
    return result;
  }
}

// A fixed window per address: at most MAX_ATTEMPTS pairing attempts a minute.
export class AttemptLimiter {
  readonly #windows = new Map<string, { start: number; count: number }>();
  readonly #now: Clock;

  constructor(now: Clock = Date.now) {
    this.#now = now;
  }

  // Counts one attempt and says whether it may go ahead.
  allow(address: string): boolean {
    const now = this.#now();
    for (const [key, window] of this.#windows) {
      if (now - window.start >= ATTEMPT_WINDOW_MS) this.#windows.delete(key);
    }
    const window = this.#windows.get(address) ?? { start: now, count: 0 };
    window.count += 1;
    this.#windows.set(address, window);
    return window.count <= MAX_ATTEMPTS;
  }
}
