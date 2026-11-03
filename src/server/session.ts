import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Device } from '../app/devices.ts';
import { sameToken } from './token.ts';

export type Port = () => number;

export const sessionCookie = (port: number) => `otea_session_${port}`;

// A paired device's token, set once by POST /api/pair (otea serve --lan).
export const deviceCookie = (port: number) => `otea_device_${port}`;

// Who is on the other end: this computer, a device paired over the LAN, or a device on the LAN that
// has not paired yet (it only reaches the pairing screen).
export type Client =
  | { kind: 'local' }
  | { kind: 'device'; device: Device; address: string }
  | { kind: 'unpaired'; address: string };

export type OteaEnv = { Variables: { client: Client } };

export const LOCAL: Client = { kind: 'local' };

export function clientOf(c: Context): Client {
  return (c.get('client') as Client | undefined) ?? LOCAL;
}

const BAD_LINK = `<!doctype html>
<meta charset="utf-8">
<title>Otea</title>
<p>This sign-in link is not valid for this Otea server. Run <code>otea open</code> in the project to open the UI with a fresh link.</p>
`;

export type Session = {
  // Acts on items: this computer's signed-in browser, or a paired device.
  canWrite(c: Context): boolean;
  // Shows the pairing code and pairs or revokes devices: this computer's signed-in browser only.
  canManageDevices(c: Context): boolean;
};

export function session(token: string | undefined, port: Port): Session {
  const signedIn = (c: Context) =>
    clientOf(c).kind === 'local' &&
    token !== undefined &&
    sameToken(getCookie(c, sessionCookie(port())) ?? '', token);
  return {
    canWrite: (c) => clientOf(c).kind === 'device' || signedIn(c),
    canManageDevices: signedIn,
  };
}

export function mountAuth(app: Hono<OteaEnv>, token: string | undefined, port: Port): void {
  app.get('/auth', (c) => {
    c.header('referrer-policy', 'no-referrer');
    c.header('cache-control', 'no-store');
    const given = c.req.query('token') ?? '';
    // The sign-in link is for this computer's browser; a device on the LAN pairs instead.
    const local = clientOf(c).kind === 'local';
    if (!local || token === undefined || !sameToken(given, token)) return c.html(BAD_LINK, 401);
    setCookie(c, sessionCookie(port()), token, { path: '/', httpOnly: true, sameSite: 'Strict' });
    return c.redirect('/', 302);
  });
}
