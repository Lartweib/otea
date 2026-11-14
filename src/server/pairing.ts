import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { encode } from 'uqr';
import { z } from 'zod';
import { type Device, deviceName, listDevices, pairDevice, revokeDevice } from '../app/devices.ts';
import type { PhoneSettings, TransportKind } from '../app/phone.ts';
import type { Project } from '../app/project.ts';
import { RejectedRequest } from './errors.ts';
import { type AttemptLimiter, formatCode, type PairingCode, type PairingCodes } from './lan.ts';
import { clientOf, deviceCookie, type Port, type Session } from './session.ts';
import type { PhoneTransport } from './transports.ts';
import { assertSameOrigin } from './writes.ts';

// Phone access as the server runs it: the pairing code it holds, whichever transport carries the
// phone, and the doors open now.
export type Phone = {
  // The local network's door, while it is open (Settings › Phone, otea phone lan --open).
  lan: PhoneTransport | undefined;
  codes: PairingCodes;
  attempts: AttemptLimiter;
  // The chosen transport, read from the project each time (otea phone and Configuración change it).
  settings(): PhoneSettings;
  // The doors open now: the chosen transport's and the local network's, when each is open.
  doors(): PhoneTransport[];
  // The chosen transport's door, which the pairing code points at; none while it is closed.
  chosen(): PhoneTransport | undefined;
};

// Browsers cap a cookie's lifetime at 400 days.
const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export type QrCode = { size: number; cells: boolean[][] };

export type PairingView = {
  // The chosen phone transport, and whether its door is open.
  transport: TransportKind;
  enabled: boolean;
  // The URLs a phone opens on it, best guess first; HTTPS on Tailscale.
  urls: string[];
  code: { code: string; expiresAt: string; url: string; qr: QrCode } | null;
  devices: Device[];
};

export function pairingUrl(base: string, code: PairingCode): string {
  // The code rides in the fragment, which the browser never sends, logs or passes on as a referrer.
  return `${base}/pair#code=${formatCode(code.code)}`;
}

export function qrCode(text: string): QrCode {
  const { size, data } = encode(text, { ecc: 'M', border: 0 });
  return { size, cells: data };
}

const hostnameOf = (url: string) => new URL(url).hostname.replace(/^\[|\]$/g, '');

// What the desk shows to pair a phone; `pick` is the host the person chose among several.
export function pairingView(
  project: Project,
  phone: Phone,
  port: number,
  pick?: string,
): PairingView {
  const devices = listDevices(project.db);
  const { transport } = phone.settings();
  const door = phone.chosen();
  if (!door) return { transport, enabled: false, urls: [], code: null, devices };
  const urls = door.urls(port);
  const base = urls.find((url) => hostnameOf(url) === pick?.toLowerCase()) ?? urls[0];
  const current = phone.codes.current();
  const code =
    current && base
      ? {
          code: formatCode(current.code),
          expiresAt: new Date(current.expiresAt).toISOString(),
          url: pairingUrl(base, current),
          qr: qrCode(pairingUrl(base, current)),
        }
      : null;
  return { transport, enabled: true, urls, code, devices };
}

export function assertCanManageDevices(c: Context, auth: Session): void {
  if (!auth.canManageDevices(c)) {
    throw new RejectedRequest(
      403,
      'forbidden',
      'Only the browser on this computer, signed in with "otea open", manages paired devices',
    );
  }
}

// Some door must be open for a phone to pair: the local network's or the chosen transport's.
export function assertPhoneOn(phone: Phone): Phone {
  if (phone.doors().length === 0) {
    throw new RejectedRequest(
      409,
      'phone_off',
      'Phone access is off; open the local network in Settings > Phone (or with "otea phone lan --open"), or set up Tailscale with "otea phone tailscale"',
    );
  }
  return phone;
}

const CodeBody = z.object({ code: z.string().min(1).max(64) });
const PairBody = CodeBody.extend({ name: z.string().max(200) });

async function body<T>(c: Context, schema: z.ZodType<T>, expected: string): Promise<T> {
  assertSameOrigin(c);
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) throw new RejectedRequest(400, 'invalid_body', `Expected ${expected}`);
  return parsed.data;
}

function attempt(c: Context, phone: Phone): void {
  const client = clientOf(c);
  const address = client.kind === 'local' ? 'local' : client.address;
  if (!phone.attempts.allow(address)) {
    c.header('retry-after', '60');
    throw new RejectedRequest(429, 'too_many_attempts', 'Too many pairing attempts; wait a minute');
  }
}

function refuse(result: 'expired' | 'wrong'): never {
  if (result === 'expired') {
    throw new RejectedRequest(
      410,
      'code_expired',
      'This pairing code expired; show a new one on the desk',
    );
  }
  throw new RejectedRequest(
    401,
    'invalid_code',
    'This pairing code is not valid; check it on the desk',
  );
}

// The phone reads what it is about to pair with before it asks for a token; the code stays good.
export async function peekPairing(c: Context, project: Project, phone: Phone) {
  const on = assertPhoneOn(phone);
  const { code } = await body(c, CodeBody, '{"code": string}');
  attempt(c, on);
  const result = on.codes.check(code);
  if (result !== 'ok') refuse(result);
  const expiresAt = new Date(on.codes.current()?.expiresAt ?? 0).toISOString();
  return { project: project.identity.name, expiresAt };
}

export async function pair(c: Context, project: Project, phone: Phone, port: Port) {
  const on = assertPhoneOn(phone);
  const { code, name } = await body(c, PairBody, '{"code": string, "name": string}');
  const named = deviceName(name);
  attempt(c, on);
  const result = on.codes.redeem(code);
  if (result !== 'ok') refuse(result);
  const { device, token } = pairDevice(project.db, named);
  const client = clientOf(c);
  setCookie(c, deviceCookie(port()), token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: DEVICE_COOKIE_MAX_AGE,
    // Over HTTPS (Tailscale) the token never travels in the clear.
    secure: client.kind !== 'local' && client.secure,
  });
  c.header('cache-control', 'no-store');
  return { project: project.identity.name, device };
}

export function revoke(project: Project, id: string): Device {
  return revokeDevice(project.db, id);
}
