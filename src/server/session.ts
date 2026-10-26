import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { sameToken } from './token.ts';

export const SESSION_COOKIE = 'otea_session';

const BAD_LINK = `<!doctype html>
<meta charset="utf-8">
<title>Otea</title>
<p>This sign-in link is not valid for this Otea server. Run <code>otea open</code> in the project to open the UI with a fresh link.</p>
`;

export type Session = { canWrite(c: Context): boolean };

export function session(token: string | undefined): Session {
  return {
    canWrite: (c) => token !== undefined && sameToken(getCookie(c, SESSION_COOKIE) ?? '', token),
  };
}

export function mountAuth(app: Hono, token: string | undefined): void {
  app.get('/auth', (c) => {
    c.header('referrer-policy', 'no-referrer');
    c.header('cache-control', 'no-store');
    const given = c.req.query('token') ?? '';
    if (token === undefined || !sameToken(given, token)) return c.html(BAD_LINK, 401);
    setCookie(c, SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'Strict' });
    return c.redirect('/', 302);
  });
}
