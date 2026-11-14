import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pairDevice } from '../app/devices.ts';
import { choosePhoneTransport, lanOpen } from '../app/phone.ts';
import type { Project } from '../app/project.ts';
import { TAILNET_HOST } from '../app/tailscale-testing.ts';
import type { LanNetwork } from './lan-access.ts';
import type { PairingView } from './pairing.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// Opening the local network while otea serve runs (Settings › Phone, otea phone lan --open): the
// server starts listening on this computer's addresses, and closing it stops. The network here is
// a fake: no test listens on the real LAN.

const DESK = '192.168.1.24';
// No test tries a URL for real.
const probe = async () => false;
const PHONE = '192.168.1.50';

type FakeNetwork = LanNetwork & {
  listening: string[];
  fail: string | undefined;
};

function fakeNetwork(addresses = [DESK]): FakeNetwork {
  const network: FakeNetwork = {
    listening: [],
    fail: undefined,
    hosts: async () => ({ addresses, names: ['desk.local'] }),
    listen: async (_fetch, address, port) => {
      if (network.fail === address) throw new Error(`listen EADDRINUSE ${address}:${port}`);
      const at = `${address}:${port}`;
      network.listening.push(at);
      return async () => {
        network.listening = network.listening.filter((open) => open !== at);
      };
    },
  };
  return network;
}

type Call = {
  method?: string;
  host?: string;
  from?: string;
  cookie?: string;
  origin?: string;
  forwardedFor?: string;
  body?: unknown;
};

describe('opening the local network while the server runs', () => {
  let project: Project;
  let server: OteaServer;
  let network: FakeNetwork;

  const call = (path: string, options: Call = {}) => {
    const {
      method = 'GET',
      host = LOCAL_HOST,
      from = '127.0.0.1',
      cookie = SESSION_COOKIE,
      origin = `http://${host}`,
      forwardedFor,
      body,
    } = options;
    const headers: Record<string, string> = { host, cookie };
    if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
    if (method === 'POST') {
      headers.origin = origin;
      headers['content-type'] = 'application/json';
    }
    const init = {
      method,
      headers,
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    };
    return Promise.resolve(
      server.app.request(path, init, { incoming: { socket: { remoteAddress: from } } }),
    );
  };
  const post = (path: string, options: Call = {}) => call(path, { ...options, method: 'POST' });
  const fromPhone = (path: string, cookie = '') =>
    call(path, { host: `${DESK}:4400`, from: PHONE, cookie });
  const errorOf = async (response: Response) =>
    ((await response.json()) as { error: { code: string; details?: unknown } }).error;
  const view = async () => (await (await call('/api/lan')).json()) as PairingView;

  beforeEach(() => {
    project = memoryProject();
    network = fakeNetwork();
    server = createServer(project, { token: TOKEN, network, probe });
  });

  afterEach(async () => {
    await server.lan.close();
    server.close();
    project.db.close();
  });

  it('starts closed: a phone on the network is refused at the door', async () => {
    expect(server.lan.isOpen()).toBe(false);
    expect((await view()).enabled).toBe(false);
    expect((await fromPhone('/api/items')).status).toBe(403);
  });

  it('opens from this computer’s browser: listens, shows a code and remembers it', async () => {
    const opened = await post('/api/lan/open');

    expect(opened.status).toBe(200);
    expect(await opened.json()).toMatchObject({
      transport: 'lan',
      url: 'http://desk.local:4400',
      lanOpen: true,
    });
    expect(network.listening).toEqual([`${DESK}:4400`]);
    const shown = await view();
    expect(shown.enabled).toBe(true);
    expect(shown.urls).toEqual(['http://desk.local:4400', `http://${DESK}:4400`]);
    expect(shown.code?.url).toMatch(/^http:\/\/desk\.local:4400\/pair#code=/);
    expect(lanOpen(project.db)).toBe(true);
    expect((await fromPhone('/api/items')).status).toBe(401);
  });

  it('opening twice listens once', async () => {
    await post('/api/lan/open');
    await post('/api/lan/open');

    expect(network.listening).toEqual([`${DESK}:4400`]);
  });

  it('closes again: stops listening, forgets the choice, keeps the paired devices', async () => {
    const { token } = pairDevice(project.db, 'Pixel · Chrome');
    await post('/api/lan/open');
    expect((await fromPhone('/api/items', `otea_device_4400=${token}`)).status).toBe(200);

    const closed = await post('/api/lan/close');

    expect(closed.status).toBe(200);
    expect(await closed.json()).toMatchObject({ lanOpen: false, url: null });
    expect(network.listening).toEqual([]);
    expect(lanOpen(project.db)).toBe(false);
    expect((await view()).enabled).toBe(false);
    expect((await view()).devices.map(({ name }) => name)).toEqual(['Pixel · Chrome']);
    expect((await fromPhone('/api/items', `otea_device_4400=${token}`)).status).toBe(403);
  });

  it('says whether Windows may ask for a firewall permission', async () => {
    const status = (await (await call('/api/phone')).json()) as { firewallPrompt: boolean };

    expect(status.firewallPrompt).toBe(process.platform === 'win32');
  });

  it('refuses a paired phone: it neither opens nor closes the network', async () => {
    const { token } = pairDevice(project.db, 'Pixel · Chrome');
    await server.lan.open();
    const cookie = `otea_device_4400=${token}`;
    const phone = { host: `${DESK}:4400`, from: PHONE, cookie, origin: `http://${DESK}:4400` };

    for (const path of ['/api/lan/close', '/api/lan/open']) {
      const refused = await post(path, phone);
      expect(refused.status).toBe(403);
      expect(await errorOf(refused)).toMatchObject({
        code: 'forbidden',
        details: { kind: 'desk_only' },
      });
    }
    expect(server.lan.isOpen()).toBe(true);
    expect(network.listening).toEqual([`${DESK}:4400`]);
  });

  it('refuses what a proxy forwarded, even from this computer', async () => {
    const forwarded = await post('/api/lan/open', { forwardedFor: '100.101.102.103' });

    expect(forwarded.status).toBe(403);
    expect(network.listening).toEqual([]);
  });

  it('refuses a request forwarded through Tailscale', async () => {
    choosePhoneTransport(project.db, { transport: 'tailscale', tailscaleHost: TAILNET_HOST });
    const { token } = pairDevice(project.db, 'Pixel · Chrome');
    const refused = await post('/api/lan/open', {
      host: TAILNET_HOST,
      forwardedFor: '100.101.102.103',
      cookie: `otea_device_4400=${token}`,
      origin: `https://${TAILNET_HOST}`,
    });

    expect(refused.status).toBe(403);
    expect(network.listening).toEqual([]);
  });

  it('refuses a browser that is not signed in, and another origin', async () => {
    expect((await post('/api/lan/open', { cookie: '' })).status).toBe(401);
    const cross = await post('/api/lan/open', { origin: 'http://evil.example' });
    expect(cross.status).toBe(403);
    expect((await errorOf(cross)).code).toBe('forbidden_origin');
    expect(network.listening).toEqual([]);
    expect(lanOpen(project.db)).toBe(false);
  });

  it('says why it could not listen, and stays closed', async () => {
    server.close();
    network = fakeNetwork([DESK, '10.0.0.7']);
    network.fail = '10.0.0.7';
    server = createServer(project, { token: TOKEN, network, probe });

    const failed = await post('/api/lan/open');

    expect(failed.status).toBe(409);
    expect(await errorOf(failed)).toMatchObject({ code: 'transport_unavailable' });
    expect(network.listening).toEqual([]);
    expect(server.lan.isOpen()).toBe(false);
    expect(lanOpen(project.db)).toBe(false);
  });

  it('cannot open without a network to listen on', async () => {
    server.close();
    server = createServer(project, { token: TOKEN, probe });

    expect((await post('/api/lan/open')).status).toBe(409);
  });
});
