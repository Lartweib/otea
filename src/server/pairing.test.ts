import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { listDevices, pairDevice, revokeDevice } from '../app/devices.ts';
import { createItem, moveItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { CODE_KEPT_MS, CODE_TTL_MS, formatCode, MAX_ATTEMPTS, MAX_WRONG_CODES } from './lan.ts';
import type { PairingView } from './pairing.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

const DESK = '192.168.1.24';
const LAN_HOST = `${DESK}:4400`;
const PHONE = '192.168.1.50';

type Call = {
  method?: string;
  body?: unknown;
  host?: string;
  from?: string;
  cookie?: string | undefined;
  origin?: string;
};

describe('LAN access', () => {
  let project: Project;
  let server: OteaServer;
  let clock: number;

  const call = (path: string, call: Call = {}) => {
    const { method = 'GET', body, host = LAN_HOST, from = PHONE, cookie, origin } = call;
    const headers: Record<string, string> = { host };
    if (cookie !== undefined) headers.cookie = cookie;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers.origin = origin ?? `http://${host}`;
    }
    const init = { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    return Promise.resolve(
      server.app.request(path, init, { incoming: { socket: { remoteAddress: from } } }),
    );
  };
  const errorOf = async (response: Response) =>
    ((await response.json()) as { error: { code: string } }).error.code;
  const deviceCookieOf = (response: Response) =>
    /otea_device_4400=[^;]+/.exec(response.headers.get('set-cookie') ?? '')?.[0];
  const issue = () => formatCode(server.phone.codes.issue().code);
  const pairPhone = async (code = issue(), name = 'Pixel · Chrome', cookie?: string) => {
    const response = await call('/api/pair', { method: 'POST', body: { code, name }, cookie });
    return { response, cookie: deviceCookieOf(response) };
  };

  beforeEach(() => {
    clock = Date.parse('2026-11-03T12:00:00Z');
    project = memoryProject();
    addCollection(project, { name: 'tasks' });
    createItem(project, {
      collection: 'tasks',
      title: 'Ship',
      fields: { description: 'Now' },
      actor: { kind: 'agent', name: 'claude' },
    });
    server = createServer(project, { token: TOKEN, lan: { addresses: [DESK] }, now: () => clock });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  describe('without --lan', () => {
    let local: OteaServer;

    beforeEach(() => {
      local = createServer(project, { token: TOKEN });
    });

    afterEach(() => local.close());

    it('refuses a request naming a LAN address, even from the LAN', async () => {
      const response = await Promise.resolve(
        local.app.request(
          '/p/memory-aaaaaa/api/items',
          { headers: { host: LAN_HOST } },
          {
            incoming: { socket: { remoteAddress: PHONE } },
          },
        ),
      );

      expect(response.status).toBe(403);
      expect(await errorOf(response)).toBe('forbidden_host');
    });

    it('refuses to pair', async () => {
      const response = await Promise.resolve(
        local.app.request('/api/pair', {
          method: 'POST',
          headers: {
            host: LOCAL_HOST,
            origin: `http://${LOCAL_HOST}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ code: 'AAAA-AAAA', name: 'Phone' }),
        }),
      );

      expect(response.status).toBe(409);
      expect(await errorOf(response)).toBe('phone_off');
    });
  });

  describe('an unpaired device', () => {
    it.each([
      '/p/memory-aaaaaa/api/items',
      '/p/memory-aaaaaa/api/items/TASKS-1',
      '/p/memory-aaaaaa/api/stream',
      '/p/memory-aaaaaa/api/session',
      '/p/memory-aaaaaa/api/lan',
    ])('is refused %s with 401', async (path) => {
      const response = await call(path);

      expect(response.status).toBe(401);
      expect(await errorOf(response)).toBe('unpaired');
    });

    it('cannot move an item', async () => {
      moveItem(project, {
        id: 'TASKS-1',
        to: 'in_progress',
        actor: { kind: 'agent', name: 'c' },
        channel: 'cli',
      });
      const response = await call('/p/memory-aaaaaa/api/items/TASKS-1/move', {
        method: 'POST',
        body: { to: 'done' },
      });

      expect(response.status).toBe(401);
    });

    it('cannot sign in with the UI token', async () => {
      const response = await call(`/auth?token=${TOKEN}`);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/pair');
      expect(response.headers.get('set-cookie')).toBeNull();
    });

    it('gets nothing with the UI session cookie', async () => {
      const response = await call('/p/memory-aaaaaa/api/items', { cookie: SESSION_COOKIE });

      expect(response.status).toBe(401);
    });

    it.each([
      ['a DNS name (rebinding)', 'otea.evil.example:4400', PHONE],
      ['localhost from the LAN', LOCAL_HOST, PHONE],
      ['another port', `${DESK}:9999`, PHONE],
      ['a public address', LAN_HOST, '203.0.113.9'],
    ])('is refused for %s with 403', async (_, host, from) => {
      const response = await call('/pair', { host, from });

      expect(response.status).toBe(403);
      expect(await errorOf(response)).toBe('forbidden_host');
    });

    it('is refused a forged device cookie', async () => {
      const response = await call('/p/memory-aaaaaa/api/items', {
        cookie: 'otea_device_4400=not-a-token',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('pairing', () => {
    // Lax, not Strict: the phone's home-screen shortcut, a notification and a link from another app
    // open Otea as a navigation from outside it, which a Strict cookie is never sent with.
    it('trades the code for a device token kept only as a hash', async () => {
      const { response, cookie } = await pairPhone();

      expect(response.status).toBe(201);
      expect(response.headers.get('set-cookie')).toMatch(
        /^otea_device_4400=[A-Za-z0-9_-]{43}; Max-Age=34560000; Path=\/; HttpOnly; SameSite=Lax$/,
      );
      expect(await response.json()).toMatchObject({ device: { name: 'Pixel · Chrome' } });
      const token = cookie?.split('=')[1] ?? '';
      const stored = JSON.stringify(server.machine.prepare('SELECT * FROM devices').all());
      expect(stored).not.toContain(token);
      expect(listDevices(server.machine)).toHaveLength(1);
    });

    it('lets the paired device read and act', async () => {
      moveItem(project, {
        id: 'TASKS-1',
        to: 'in_progress',
        actor: { kind: 'agent', name: 'c' },
        channel: 'cli',
      });
      moveItem(project, {
        id: 'TASKS-1',
        to: 'review',
        actor: { kind: 'agent', name: 'c' },
        channel: 'cli',
      });
      const { cookie } = await pairPhone();

      expect((await call('/p/memory-aaaaaa/api/items', { cookie })).status).toBe(200);
      expect(await (await call('/p/memory-aaaaaa/api/session', { cookie })).json()).toEqual({
        canWrite: true,
        canManageDevices: false,
        canConfigure: false,
      });
      const moved = await call('/p/memory-aaaaaa/api/items/TASKS-1/move', {
        method: 'POST',
        body: { to: 'done' },
        cookie,
      });
      expect(moved.status).toBe(200);
    });

    it('does not let a paired device manage devices', async () => {
      const { cookie } = await pairPhone();
      const id = listDevices(server.machine)[0]?.id ?? '';

      expect((await call('/p/memory-aaaaaa/api/lan', { cookie })).status).toBe(403);
      expect(
        (await call('/p/memory-aaaaaa/api/lan/code', { method: 'POST', body: {}, cookie })).status,
      ).toBe(403);
      expect(
        (await call('/p/memory-aaaaaa/api/lan/code/fresh', { method: 'POST', body: {}, cookie }))
          .status,
      ).toBe(403);
      const revoke = await call(`/p/memory-aaaaaa/api/devices/${id}/revoke`, {
        method: 'POST',
        body: {},
        cookie,
      });
      expect(revoke.status).toBe(403);
    });

    it('pairs a phone that is already paired again as the same device, not one more', async () => {
      const first = await pairPhone();
      const [device] = listDevices(server.machine);

      const again = await pairPhone(issue(), 'Pixel · Chrome (2)', first.cookie);

      expect(again.response.status).toBe(201);
      expect(listDevices(server.machine)).toEqual([
        expect.objectContaining({ id: device?.id, name: 'Pixel · Chrome (2)' }),
      ]);
      expect((await call('/p/memory-aaaaaa/api/items', { cookie: again.cookie })).status).toBe(200);
      expect((await call('/p/memory-aaaaaa/api/items', { cookie: first.cookie })).status).toBe(401);
    });

    it('adds a device when the phone pairing carries no token of this project', async () => {
      await pairPhone();

      await pairPhone(issue(), 'Tablet', 'otea_device_4400=not-a-device');

      expect(listDevices(server.machine).map((d) => d.name)).toEqual(['Pixel · Chrome', 'Tablet']);
    });

    it('takes the code without the dash or in lower case', async () => {
      const code = issue().replace('-', '').toLowerCase();

      expect((await pairPhone(code)).response.status).toBe(201);
    });

    it('uses the code up', async () => {
      const code = issue();
      await pairPhone(code);
      const again = await pairPhone(code);

      expect(again.response.status).toBe(401);
      expect(again.cookie).toBeUndefined();
    });

    it('refuses an expired code', async () => {
      const code = issue();
      clock += CODE_TTL_MS;
      const { response, cookie } = await pairPhone(code);

      expect(response.status).toBe(410);
      expect(await errorOf(response)).toBe('code_expired');
      expect(cookie).toBeUndefined();
      expect(listDevices(server.machine)).toEqual([]);
    });

    it('refuses a wrong code', async () => {
      issue();
      const { response } = await pairPhone('2222-2222');

      expect(response.status).toBe(401);
      expect(await errorOf(response)).toBe('invalid_code');
    });

    it(`burns the code after ${MAX_WRONG_CODES} wrong ones`, async () => {
      const code = issue();
      for (let index = 0; index < MAX_WRONG_CODES; index += 1) await pairPhone('2222-2222');

      expect((await pairPhone(code)).response.status).toBe(401);
    });

    it(`limits an address to ${MAX_ATTEMPTS} attempts a minute`, async () => {
      for (let index = 0; index < MAX_ATTEMPTS; index += 1) {
        const peek = await call('/api/pair/peek', { method: 'POST', body: { code: 'x' } });
        expect(peek.status).not.toBe(429);
      }
      const limited = await pairPhone(issue());

      expect(limited.response.status).toBe(429);
      expect(limited.response.headers.get('retry-after')).toBe('60');
      clock += 60_000;
      expect((await pairPhone(issue())).response.status).toBe(201);
    });

    it('refuses a pairing posted from another origin', async () => {
      const response = await call('/api/pair', {
        method: 'POST',
        body: { code: issue(), name: 'Phone' },
        origin: 'http://evil.example',
      });

      expect(response.status).toBe(403);
      expect(await errorOf(response)).toBe('forbidden_origin');
    });

    it('lets the phone read the project and the time left without using the code', async () => {
      const code = issue();
      const peek = await call('/api/pair/peek', { method: 'POST', body: { code } });

      expect(await peek.json()).toEqual({
        computer: 'Otea',
        expiresAt: new Date(clock + CODE_TTL_MS).toISOString(),
        paired: false,
      });
      expect((await pairPhone(code)).response.status).toBe(201);
    });

    // TS-13: a phone paired already read "not paired yet" before pairing again.
    it('tells a phone paired already that it is', async () => {
      const { cookie } = await pairPhone();
      const peek = await call('/api/pair/peek', {
        method: 'POST',
        body: { code: issue() },
        cookie,
      });

      expect(await peek.json()).toMatchObject({ paired: true });
    });
  });

  describe('a revoked device', () => {
    it('is refused at once', async () => {
      const { cookie } = await pairPhone();
      const id = listDevices(server.machine)[0]?.id ?? '';
      revokeDevice(server.machine, id);

      const response = await call('/p/memory-aaaaaa/api/items', { cookie });
      expect(response.status).toBe(401);
      expect(await errorOf(response)).toBe('unpaired');
    });

    it('is refused once revoked from the desk', async () => {
      const { cookie } = await pairPhone();
      const id = listDevices(server.machine)[0]?.id ?? '';
      const revoke = await call(`/p/memory-aaaaaa/api/devices/${id}/revoke`, {
        method: 'POST',
        body: {},
        host: LOCAL_HOST,
        from: '127.0.0.1',
        cookie: SESSION_COOKIE,
      });

      expect(revoke.status).toBe(200);
      expect((await call('/p/memory-aaaaaa/api/items', { cookie })).status).toBe(401);
    });
  });

  describe('the desk', () => {
    const desk = (path: string, call_: Call = {}) =>
      call(path, { host: LOCAL_HOST, from: '127.0.0.1', cookie: SESSION_COOKIE, ...call_ });

    it('works from localhost as before', async () => {
      expect((await desk('/p/memory-aaaaaa/api/items', { cookie: '' })).status).toBe(200);
      expect((await desk('/p/memory-aaaaaa/api/items', { from: '::ffff:127.0.0.1' })).status).toBe(
        200,
      );
    });

    it('shows the pairing code as a QR code and the paired devices', async () => {
      const code = issue();
      pairDevice(server.machine, 'iPad');
      const view = (await (await desk('/p/memory-aaaaaa/api/lan')).json()) as PairingView;

      expect(view).toMatchObject({
        transport: 'lan',
        enabled: true,
        urls: [`http://${LAN_HOST}`],
        code: { code, url: `http://${LAN_HOST}/pair#code=${code}` },
        devices: [{ name: 'iPad' }],
      });
      expect(view.code?.qr.cells).toHaveLength(view.code?.qr.size ?? -1);
    });

    it('issues a new code, replacing the old one', async () => {
      const old = issue();
      const response = await desk('/p/memory-aaaaaa/api/lan/code', { method: 'POST', body: {} });
      const { code } = ((await response.json()) as PairingView).code ?? { code: '' };

      expect(response.status).toBe(201);
      expect(code).not.toBe(old);
      expect((await pairPhone(old)).response.status).toBe(401);
    });

    // P7-R3-5: the dialog opened on the code otea serve issued minutes before, under «Caduca en 10
    // minutos».
    describe('opening the pairing dialog', () => {
      const open = () => desk('/p/memory-aaaaaa/api/lan/code/fresh', { method: 'POST', body: {} });
      const codeOf = async (response: Response) => ((await response.json()) as PairingView).code;

      it('shows a new code with its whole lifetime ahead, once the last one is a while old', async () => {
        const old = issue();
        clock += 4 * 60 * 1000;

        const response = await open();
        const code = await codeOf(response);

        expect(response.status).toBe(200);
        expect(code?.code).not.toBe(old);
        expect(Date.parse(code?.expiresAt ?? '')).toBe(clock + CODE_TTL_MS);
        expect(code?.url).toBe(`http://${LAN_HOST}/pair#code=${code?.code}`);
        expect((await pairPhone(old)).response.status).toBe(401);
      });

      it('keeps the code a moment old, the one another tab or otea serve shows', async () => {
        const shown = issue();
        clock += CODE_KEPT_MS - 1;

        expect((await codeOf(await open()))?.code).toBe(shown);
      });

      it('keeps the code a phone is pairing with', async () => {
        const shown = issue();
        clock += 5 * 60 * 1000;
        const peek = await call('/api/pair/peek', { method: 'POST', body: { code: shown } });
        expect(peek.status).toBe(200);

        expect((await codeOf(await open()))?.code).toBe(shown);
        expect((await pairPhone(shown)).response.status).toBe(201);
      });

      it('shows no code while phone access is off', async () => {
        const local = createServer(project, { token: TOKEN });
        const response = await Promise.resolve(
          local.app.request(
            '/p/memory-aaaaaa/api/lan/code/fresh',
            {
              method: 'POST',
              headers: {
                host: LOCAL_HOST,
                origin: `http://${LOCAL_HOST}`,
                cookie: SESSION_COOKIE,
                'content-type': 'application/json',
              },
              body: '{}',
            },
            { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
          ),
        );
        local.close();

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ enabled: false, code: null });
        expect(local.phone.codes.current()).toBeUndefined();
      });

      it('needs the signed-in browser', async () => {
        const response = await desk('/p/memory-aaaaaa/api/lan/code/fresh', {
          method: 'POST',
          body: {},
          cookie: '',
        });

        expect(response.status).toBe(403);
      });
    });

    it('needs the signed-in browser to see the code', async () => {
      issue();

      expect((await desk('/p/memory-aaaaaa/api/lan', { cookie: '' })).status).toBe(403);
    });
  });
});
