import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { listDevices } from '../app/devices.ts';
import { createItem } from '../app/items.ts';
import { choosePhoneTransport, phoneSettings } from '../app/phone.ts';
import type { Project } from '../app/project.ts';
import { type FakeTailscale, fakeTailscale, TAILNET_HOST } from '../app/tailscale-testing.ts';
import { formatCode } from './lan.ts';
import type { PairingView } from './pairing.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// Phone transports as the server runs them. Tailscale is always the fake CLI: no test runs
// `tailscale up` or `tailscale serve`.

const PHONE_ON_TAILNET = '100.101.102.103';

type Call = {
  method?: string;
  body?: unknown;
  host?: string;
  from?: string;
  // The phone's tailnet address tailscale serve passes on; '' for none.
  forwardedFor?: string;
  cookie?: string | undefined;
  origin?: string;
};

describe('phone transports on the server', () => {
  let project: Project;
  let server: OteaServer;
  let cli: FakeTailscale;
  let reachable: boolean;
  const probed: string[] = [];

  // What tailscale serve forwards: from this computer, naming the tailnet name, on HTTPS.
  const viaTailscale = (path: string, call: Call = {}) => {
    const {
      method = 'GET',
      body,
      host = TAILNET_HOST,
      from = '127.0.0.1',
      forwardedFor = PHONE_ON_TAILNET,
      cookie,
      origin,
    } = call;
    const headers: Record<string, string> = { host };
    if (forwardedFor !== '') headers['x-forwarded-for'] = forwardedFor;
    if (cookie !== undefined) headers.cookie = cookie;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers.origin = origin ?? `https://${host}`;
    }
    const init = { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    return Promise.resolve(
      server.app.request(path, init, { incoming: { socket: { remoteAddress: from } } }),
    );
  };
  const desk = (path: string, call: Call = {}) =>
    viaTailscale(path, {
      host: LOCAL_HOST,
      forwardedFor: '',
      cookie: SESSION_COOKIE,
      origin: `http://${LOCAL_HOST}`,
      ...call,
    });
  const errorOf = async (response: Response) =>
    ((await response.json()) as { error: { code: string } }).error.code;
  const pairOverTailscale = async () => {
    const code = formatCode(server.phone.codes.issue().code);
    const response = await viaTailscale('/api/pair', {
      method: 'POST',
      body: { code, name: 'Pixel · Chrome' },
    });
    const cookie = /otea_device_4400=[^;]+/.exec(response.headers.get('set-cookie') ?? '')?.[0];
    return { response, cookie };
  };

  beforeEach(() => {
    project = memoryProject();
    addCollection(project, { name: 'tasks' });
    createItem(project, {
      collection: 'tasks',
      title: 'Ship',
      fields: { description: 'Now' },
      actor: { kind: 'agent', name: 'claude' },
    });
    cli = fakeTailscale();
    reachable = true;
    probed.length = 0;
    server = createServer(project, {
      token: TOKEN,
      tailscale: cli,
      probe: async (url) => {
        probed.push(url);
        return reachable;
      },
    });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  describe('on Tailscale', () => {
    beforeEach(() => {
      choosePhoneTransport(server.machine, { transport: 'tailscale', tailscaleHost: TAILNET_HOST });
    });

    it('sends a phone that has not paired to the pairing screen', async () => {
      const page = await viaTailscale('/');
      expect(page.status).toBe(302);
      expect(page.headers.get('location')).toBe('/pair');

      const api = await viaTailscale('/p/memory-aaaaaa/api/items');
      expect(api.status).toBe(401);
      expect(await errorOf(api)).toBe('unpaired');
    });

    it('pairs over HTTPS with a token that never travels in the clear', async () => {
      const { response } = await pairOverTailscale();

      expect(response.status).toBe(201);
      expect(response.headers.get('set-cookie')).toMatch(/; Secure/);
      expect(listDevices(server.machine)).toHaveLength(1);
    });

    it('lets the paired phone read and act from its HTTPS page, and nothing more', async () => {
      const { cookie } = await pairOverTailscale();

      expect((await viaTailscale('/p/memory-aaaaaa/api/items', { cookie })).status).toBe(200);
      expect(await (await viaTailscale('/p/memory-aaaaaa/api/session', { cookie })).json()).toEqual(
        {
          canWrite: true,
          canManageDevices: false,
          canConfigure: false,
        },
      );
      const update = (origin: string) =>
        viaTailscale('/p/memory-aaaaaa/api/items/TASKS-1/update', {
          method: 'POST',
          body: { fields: { description: 'Later' } },
          cookie,
          origin,
        });
      expect((await update(`https://${TAILNET_HOST}`)).status).toBe(200);
      expect(await errorOf(await update(`http://${TAILNET_HOST}`))).toBe('forbidden_origin');
      const choose = await viaTailscale('/p/memory-aaaaaa/api/phone', {
        method: 'POST',
        body: { transport: 'lan' },
        cookie,
      });
      expect(choose.status).toBe(403);
    });

    it('never takes what tailscale serve forwards for this computer’s own browser', async () => {
      const response = await viaTailscale('/p/memory-aaaaaa/api/items', {
        host: LOCAL_HOST,
        cookie: SESSION_COOKIE,
      });

      expect(response.status).toBe(401);
      expect(await errorOf(response)).toBe('unpaired');
    });

    it('turns away the tailnet name from anywhere but tailscale serve', async () => {
      const response = await viaTailscale('/p/memory-aaaaaa/api/items', { from: PHONE_ON_TAILNET });

      expect(response.status).toBe(403);
      expect(await errorOf(response)).toBe('forbidden_host');
    });

    it('shows the desk a code that opens the HTTPS name', async () => {
      const code = formatCode(server.phone.codes.issue().code);
      const view = (await (await desk('/p/memory-aaaaaa/api/lan')).json()) as PairingView;

      expect(view).toMatchObject({
        transport: 'tailscale',
        enabled: true,
        urls: [`https://${TAILNET_HOST}`],
        code: { code, url: `https://${TAILNET_HOST}/pair#code=${code}` },
      });
    });
  });

  describe('on the local network without --lan', () => {
    it('has no door open and no code to show', async () => {
      const view = (await (await desk('/p/memory-aaaaaa/api/lan')).json()) as PairingView;

      expect(view).toMatchObject({ transport: 'lan', enabled: false, urls: [], code: null });
    });

    it('turns away what a proxy forwards, even naming localhost', async () => {
      const response = await viaTailscale('/p/memory-aaaaaa/api/items', { host: LOCAL_HOST });

      expect(response.status).toBe(403);
      expect(await errorOf(response)).toBe('forbidden_host');
    });

    it('turns away the tailnet name', async () => {
      expect((await viaTailscale('/p/memory-aaaaaa/api/items')).status).toBe(403);
    });
  });

  describe('Configuración', () => {
    it('reads the transport, its URL and whether it answers', async () => {
      choosePhoneTransport(server.machine, { transport: 'tailscale', tailscaleHost: TAILNET_HOST });
      cli.routes = [{ host: TAILNET_HOST, port: 443, path: '/', target: 'http://127.0.0.1:4400' }];

      const response = await desk('/p/memory-aaaaaa/api/phone');

      expect(await response.json()).toMatchObject({
        transport: 'tailscale',
        url: `https://${TAILNET_HOST}`,
        reachable: true,
        tailscale: { state: 'ready', serving: true },
      });
      expect(probed).toEqual([`https://${TAILNET_HOST}`]);
    });

    it('never runs tailscale serve on its own when Tailscale is chosen', async () => {
      const response = await desk('/p/memory-aaaaaa/api/phone', {
        method: 'POST',
        body: { transport: 'tailscale' },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        transport: 'lan',
        tailscale: { state: 'ready', serving: false },
      });
      expect(cli.calls).not.toContain('serve 4400');
      expect(phoneSettings(server.machine).transport).toBe('lan');
    });

    it('takes Tailscale once tailscale serve already forwards to Otea', async () => {
      cli.routes = [{ host: TAILNET_HOST, port: 443, path: '/', target: 'http://127.0.0.1:4400' }];

      const response = await desk('/p/memory-aaaaaa/api/phone', {
        method: 'POST',
        body: { transport: 'tailscale' },
      });

      expect(await response.json()).toMatchObject({
        transport: 'tailscale',
        url: `https://${TAILNET_HOST}`,
        tailscale: { state: 'ready', serving: true },
      });
      expect(cli.calls).not.toContain('serve 4400');
      expect(server.phone.codes.current()).toBeDefined();
    });

    it('runs the one command it showed, once the person confirms it', async () => {
      const response = await desk('/p/memory-aaaaaa/api/phone/tailscale/serve', {
        method: 'POST',
        body: { command: 'tailscale serve --bg --https=443 http://127.0.0.1:4400' },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        transport: 'tailscale',
        url: `https://${TAILNET_HOST}`,
        tailscale: { state: 'ready', serving: true },
      });
      expect(cli.calls.filter((call) => /^serve \d/.test(call))).toEqual(['serve 4400']);
      expect(cli.calls).not.toContain('up');
    });

    it('refuses to run anything but the command it shows', async () => {
      for (const command of [
        'tailscale serve --bg --https=443 http://127.0.0.1:3000',
        'tailscale funnel 4400',
        '',
      ]) {
        const response = await desk('/p/memory-aaaaaa/api/phone/tailscale/serve', {
          method: 'POST',
          body: { command },
        });
        expect(response.status).toBe(400);
      }
      const bare = await desk('/p/memory-aaaaaa/api/phone/tailscale/serve', {
        method: 'POST',
        body: {},
      });
      expect(bare.status).toBe(400);
      expect(cli.calls.filter((call) => /^serve \d/.test(call))).toEqual([]);
    });

    it('runs nothing while a step before it is missing', async () => {
      cli.state = { ...cli.state, https: false };

      const response = await desk('/p/memory-aaaaaa/api/phone/tailscale/serve', {
        method: 'POST',
        body: { command: 'tailscale serve --bg --https=443 http://127.0.0.1:4400' },
      });

      expect(await response.json()).toMatchObject({
        transport: 'lan',
        tailscale: { state: 'no_https' },
      });
      expect(cli.calls.filter((call) => /^serve \d/.test(call))).toEqual([]);
    });

    it('lets only this computer’s signed-in browser run it', async () => {
      const body = { command: 'tailscale serve --bg --https=443 http://127.0.0.1:4400' };
      const signedOut = await desk('/p/memory-aaaaaa/api/phone/tailscale/serve', {
        method: 'POST',
        body,
        cookie: '',
      });
      expect(signedOut.status).toBe(401);
      const { cookie } = await pairOverTailscale();
      const phone = await viaTailscale('/api/phone/tailscale/serve', {
        method: 'POST',
        body,
        cookie,
      });
      expect(phone.status).toBe(403);
      const forged = await desk('/p/memory-aaaaaa/api/phone/tailscale/serve', {
        method: 'POST',
        body,
        origin: 'https://evil.example',
      });
      expect(forged.status).toBe(403);
      expect(cli.calls.filter((call) => /^serve \d/.test(call))).toEqual([]);
    });

    it('reads the guided steps without changing anything', async () => {
      cli.state = { ...cli.state, phoneOnTailnet: true };

      const response = await desk('/p/memory-aaaaaa/api/phone/tailscale');

      expect(response.status).toBe(200);
      const guide = (await response.json()) as {
        done: Record<string, boolean>;
        command: string;
        undo: string;
        stores: Record<string, { url: string; qr: { size: number; cells: boolean[][] } }>;
      };
      expect(guide.done).toEqual({
        phone: true,
        pc: true,
        signIn: true,
        https: true,
        serve: false,
        pair: false,
      });
      expect(guide.command).toBe('tailscale serve --bg --https=443 http://127.0.0.1:4400');
      expect(guide.undo).toBe('tailscale serve --https=443 off');
      expect(guide.stores.android?.url).toBe(
        'https://play.google.com/store/apps/details?id=com.tailscale.ipn',
      );
      expect(guide.stores.ios?.qr.size).toBeGreaterThan(20);
      expect(cli.calls).toEqual(['status', 'serve status']);
      const signedOut = await desk('/p/memory-aaaaaa/api/phone/tailscale', { cookie: '' });
      expect(signedOut.status).toBe(403);
    });

    it('reads the last step from the paired devices: paired over Tailscale, then with notifications', async () => {
      choosePhoneTransport(server.machine, { transport: 'tailscale', tailscaleHost: TAILNET_HOST });
      cli.state = { ...cli.state, phoneOnTailnet: true, phoneOnline: false };
      cli.routes = [{ host: TAILNET_HOST, port: 443, path: '/', target: 'http://127.0.0.1:4400' }];
      const guide = async () =>
        (await (await desk('/p/memory-aaaaaa/api/phone/tailscale')).json()) as {
          done: Record<string, boolean>;
          pairing: string;
          phoneOnline: boolean | null;
        };

      expect(await guide()).toMatchObject({ pairing: 'none', phoneOnline: false });
      const { cookie } = await pairOverTailscale();
      expect(listDevices(server.machine)[0]?.via).toBe('tailscale');
      expect(await guide()).toMatchObject({ pairing: 'paired', done: { pair: false } });

      const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
      const subscribed = await viaTailscale('/p/memory-aaaaaa/api/notify/subscribe', {
        method: 'POST',
        cookie,
        body: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh, auth: Buffer.alloc(16, 1).toString('base64url') },
          lang: 'es',
        },
      });
      expect(subscribed.status).toBe(201);
      expect(await guide()).toMatchObject({ pairing: 'push', done: { pair: true } });
    });

    it('says what is missing and stays on the local network', async () => {
      cli.installed = false;

      const response = await desk('/p/memory-aaaaaa/api/phone', {
        method: 'POST',
        body: { transport: 'tailscale' },
      });

      expect(await response.json()).toMatchObject({
        transport: 'lan',
        tailscale: {
          state: 'missing',
          install: { link: expect.stringContaining('tailscale.com') },
        },
      });
      expect(phoneSettings(server.machine).transport).toBe('lan');
    });

    it('goes back to the local network', async () => {
      choosePhoneTransport(server.machine, { transport: 'tailscale', tailscaleHost: TAILNET_HOST });

      const response = await desk('/p/memory-aaaaaa/api/phone', {
        method: 'POST',
        body: { transport: 'lan' },
      });

      expect(await response.json()).toMatchObject({ transport: 'lan', tailscale: null });
      expect(phoneSettings(server.machine).transport).toBe('lan');
    });

    it('refuses the Otea relay, which is not available yet', async () => {
      const response = await desk('/p/memory-aaaaaa/api/phone', {
        method: 'POST',
        body: { transport: 'relay' },
      });

      expect(response.status).toBe(409);
      expect(await errorOf(response)).toBe('transport_unavailable');
    });

    it('is the signed-in browser’s alone', async () => {
      const response = await desk('/p/memory-aaaaaa/api/phone', {
        method: 'POST',
        body: { transport: 'tailscale' },
        cookie: '',
      });

      expect(response.status).toBe(401);
      expect(cli.calls).toEqual([]);
    });
  });
});
