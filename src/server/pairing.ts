import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { encode } from 'uqr';
import { z } from 'zod';
import { type Device, deviceName, listDevices, pairDevice, revokeDevice } from '../app/devices.ts';
import type { Project } from '../app/project.ts';
import { RejectedRequest } from './errors.ts';
import { type AttemptLimiter, formatCode, type PairingCode, type PairingCodes } from './lan.ts';
import { clientOf, deviceCookie, type Port, type Session } from './session.ts';
import { assertSameOrigin } from './writes.ts';

// LAN access as the server runs it: the hosts a device may name (this computer's .local name when
// it resolves, then its addresses), and the pairing code it holds.
export type Lan = {
  hosts: string[];
  codes: PairingCodes;
  attempts: AttemptLimiter;
};

// Browsers cap a cookie's lifetime at 400 days.
const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export type QrCode = { size: number; cells: boolean[][] };

export type LanView = {
  enabled: boolean;
  // The URLs a device on the network opens, best guess first.
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

export function lanView(
  project: Project,
  lan: Lan | undefined,
  port: number,
  pick?: string,
): LanView {
  const devices = listDevices(project.db);
  if (!lan) return { enabled: false, urls: [], code: null, devices };
  const urls = lan.hosts.map((host) => `http://${host}:${port}`);
  const base = urls.find((url) => url === `http://${pick}:${port}`) ?? urls[0];
  const current = lan.codes.current();
  const code =
    current && base
      ? {
          code: formatCode(current.code),
          expiresAt: new Date(current.expiresAt).toISOString(),
          url: pairingUrl(base, current),
          qr: qrCode(pairingUrl(base, current)),
        }
      : null;
  return { enabled: true, urls, code, devices };
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

export function assertLanOn(lan: Lan | undefined): Lan {
  if (!lan)
    throw new RejectedRequest(409, 'lan_off', 'LAN access is off; start "otea serve --lan"');
  return lan;
}

const CodeBody = z.object({ code: z.string().min(1).max(64) });
const PairBody = CodeBody.extend({ name: z.string().max(200) });

async function body<T>(c: Context, schema: z.ZodType<T>, expected: string): Promise<T> {
  assertSameOrigin(c);
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) throw new RejectedRequest(400, 'invalid_body', `Expected ${expected}`);
  return parsed.data;
}

function attempt(c: Context, lan: Lan): void {
  const client = clientOf(c);
  const address = client.kind === 'local' ? 'local' : client.address;
  if (!lan.attempts.allow(address)) {
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
export async function peekPairing(c: Context, project: Project, lan: Lan | undefined) {
  const on = assertLanOn(lan);
  const { code } = await body(c, CodeBody, '{"code": string}');
  attempt(c, on);
  const result = on.codes.check(code);
  if (result !== 'ok') refuse(result);
  const expiresAt = new Date(on.codes.current()?.expiresAt ?? 0).toISOString();
  return { project: project.identity.name, expiresAt };
}

export async function pair(c: Context, project: Project, lan: Lan | undefined, port: Port) {
  const on = assertLanOn(lan);
  const { code, name } = await body(c, PairBody, '{"code": string, "name": string}');
  const named = deviceName(name);
  attempt(c, on);
  const result = on.codes.redeem(code);
  if (result !== 'ok') refuse(result);
  const { device, token } = pairDevice(project.db, named);
  setCookie(c, deviceCookie(port()), token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
  c.header('cache-control', 'no-store');
  return { project: project.identity.name, device };
}

export function revoke(project: Project, id: string): Device {
  return revokeDevice(project.db, id);
}
