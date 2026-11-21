import { createECDH, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, moveItem } from '../app/items.ts';
import { claimItem, releaseItem } from '../app/leases.ts';
import { listTargets } from '../app/notify-targets.ts';
import { choosePhoneTransport } from '../app/phone.ts';
import type { Project } from '../app/project.ts';
import { fakeTailscale, TAILNET_HOST } from '../app/tailscale-testing.ts';
import type { Actor } from '../core/item.ts';
import { DEFAULT_PREFS, GATHER_MS, SPACING_MS } from '../core/notify/planner.ts';
import { formatCode } from './lan.ts';
import type { PushOutcome, PushSender, PushSubscriptionKeys } from './push.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// Notifications as the server runs them: the subscription API, who is told what and when, and
// what happens to subscriptions that go away. The push itself is a fake sender; push.test.ts
// covers the real one.

const claude: Actor = { kind: 'agent', name: 'claude' };
const PHONE_ON_TAILNET = '100.101.102.103';
const T0 = Date.parse('2026-11-14T10:00:00.000Z');

type Call = { method?: string; body?: unknown; cookie?: string | undefined; origin?: string };

function browserKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
}

describe('notifications on the server', () => {
  let project: Project;
  let server: OteaServer;
  let clock: number;
  let answer: PushOutcome;
  const logged: string[] = [];
  const sent: { subscription: PushSubscriptionKeys; payload: Record<string, unknown> }[] = [];
  const sender: PushSender = {
    async send(subscription, payload) {
      sent.push({ subscription, payload: JSON.parse(payload) });
      return answer;
    },
  };

  const viaTailscale = (path: string, call: Call = {}) => {
    const { method = 'GET', body, cookie, origin = `https://${TAILNET_HOST}` } = call;
    const headers: Record<string, string> = {
      host: TAILNET_HOST,
      'x-forwarded-for': PHONE_ON_TAILNET,
    };
    if (cookie !== undefined) headers.cookie = cookie;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers.origin = origin;
    }
    const init = { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    return Promise.resolve(
      server.app.request(path, init, { incoming: { socket: { remoteAddress: '127.0.0.1' } } }),
    );
  };
  const desk = (path: string, call: Call = {}) => {
    const { method = 'GET', body, cookie = SESSION_COOKIE } = call;
    const headers: Record<string, string> = { host: LOCAL_HOST };
    if (cookie !== undefined) headers.cookie = cookie;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers.origin = `http://${LOCAL_HOST}`;
    }
    const init = { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    return Promise.resolve(server.app.request(path, init));
  };
  const errorOf = async (response: Response) =>
    ((await response.json()) as { error: { code: string } }).error.code;
  const pair = async () => {
    const code = formatCode(server.phone.codes.issue().code);
    const response = await viaTailscale('/api/pair', {
      method: 'POST',
      body: { code, name: 'Pixel · Chrome' },
    });
    const cookie = /otea_device_4400=[^;]+/.exec(response.headers.get('set-cookie') ?? '')?.[0];
    const { device } = (await response.json()) as { device: { id: string } };
    return { cookie, device: device.id };
  };
  const endpoint = (n = 1) => `https://fcm.googleapis.com/fcm/send/phone-${n}`;
  const subscribe = (cookie: string | undefined, n = 1) =>
    viaTailscale('/p/memory-aaaaaa/api/notify/subscribe', {
      method: 'POST',
      cookie,
      body: { endpoint: endpoint(n), keys: browserKeys(), lang: 'es' },
    });
  const at = () => new Date(clock).toISOString();
  const toReview = (id: string) => {
    claimItem(project, { id, actor: claude }, at);
    moveItem(project, { id, to: 'in_progress', actor: claude, channel: 'cli' }, at);
    moveItem(project, { id, to: 'review', actor: claude, channel: 'cli' }, at);
  };
  const newTask = (title: string) =>
    createItem(
      project,
      { collection: 'tasks', title, fields: { description: 'Now' }, actor: claude },
      at,
    ).id;
  // A moment passes and the server looks again.
  const pass = async (ms: number) => {
    clock += ms;
    server.notifierOf(project.identity.id)?.scan();
    await server.notifierOf(project.identity.id)?.settled();
  };

  beforeEach(() => {
    project = memoryProject();
    addCollection(project, { name: 'tasks' });
    clock = T0;
    answer = { result: 'sent', status: 201, detail: '' };
    sent.length = 0;
    logged.length = 0;
    server = createServer(project, {
      token: TOKEN,
      tailscale: fakeTailscale(),
      now: () => clock,
      notify: {
        sender,
        tickMs: 60 * 60_000,
        minuteOfDay: () => 12 * 60,
        log: (line) => logged.push(line),
      },
    });
    choosePhoneTransport(server.machine, { transport: 'tailscale', tailscaleHost: TAILNET_HOST });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  describe('the subscription API', () => {
    it('gives a paired phone on HTTPS the key to subscribe with, and its defaults', async () => {
      const { cookie } = await pair();
      const view = await (await viaTailscale('/p/memory-aaaaaa/api/notify', { cookie })).json();
      expect(view).toEqual({
        target: 'device',
        key: expect.stringMatching(/^[A-Za-z0-9_-]{87}$/),
        subscribed: false,
        prefs: {
          turn: true,
          ask: true,
          replied: true,
          stuck: true,
          aside: false,
          quiet: null,
          muted: [],
        },
      });
    });

    it('subscribes the phone, and unsubscribes it', async () => {
      const { cookie, device } = await pair();
      const subscribed = await subscribe(cookie);
      expect(subscribed.status).toBe(201);
      expect(await subscribed.json()).toMatchObject({ subscribed: true });
      expect(listTargets(server.machine)).toEqual([
        expect.objectContaining({
          device,
          lang: 'es',
          push: expect.objectContaining({ endpoint: endpoint() }),
        }),
      ]);

      const left = await viaTailscale('/p/memory-aaaaaa/api/notify/unsubscribe', {
        method: 'POST',
        cookie,
        body: {},
      });
      expect(await left.json()).toMatchObject({ subscribed: false });
      expect(listTargets(server.machine)).toEqual([]);
    });

    it('refuses an endpoint that is not a browser’s push service, and keys that do not read', async () => {
      const { cookie } = await pair();
      const local = await viaTailscale('/p/memory-aaaaaa/api/notify/subscribe', {
        method: 'POST',
        cookie,
        body: { endpoint: 'https://192.168.1.20/hook', keys: browserKeys(), lang: 'es' },
      });
      expect(local.status).toBe(400);
      const bad = await viaTailscale('/p/memory-aaaaaa/api/notify/subscribe', {
        method: 'POST',
        cookie,
        body: { endpoint: endpoint(), keys: { p256dh: 'AAAA', auth: 'AAAA' }, lang: 'es' },
      });
      expect(bad.status).toBe(400);
      expect(listTargets(server.machine)).toEqual([]);
    });

    it('refuses a subscription from another origin or from a device not paired', async () => {
      const { cookie } = await pair();
      const cross = await viaTailscale('/p/memory-aaaaaa/api/notify/subscribe', {
        method: 'POST',
        cookie,
        origin: 'https://evil.example',
        body: { endpoint: endpoint(), keys: browserKeys(), lang: 'es' },
      });
      expect(cross.status).toBe(403);
      expect((await subscribe(undefined)).status).toBe(401);
    });

    it('keeps the kinds and the quiet hours the phone chose', async () => {
      const { cookie } = await pair();
      await subscribe(cookie);
      const prefs = {
        ...DEFAULT_PREFS,
        replied: false,
        aside: true,
        quiet: { from: '23:00', to: '07:00' },
        muted: ['other-bbbbbb'],
      };
      const saved = await viaTailscale('/p/memory-aaaaaa/api/notify/prefs', {
        method: 'POST',
        cookie,
        body: { prefs, lang: 'en' },
      });
      expect(await saved.json()).toMatchObject({ prefs });
      const wrong = await viaTailscale('/p/memory-aaaaaa/api/notify/prefs', {
        method: 'POST',
        cookie,
        body: { prefs: { ...prefs, quiet: { from: '25:00', to: '07:00' } }, lang: 'en' },
      });
      expect(wrong.status).toBe(400);
      const { muted: _, ...unmuted } = prefs;
      const partial = await viaTailscale('/p/memory-aaaaaa/api/notify/prefs', {
        method: 'POST',
        cookie,
        body: { prefs: unmuted, lang: 'en' },
      });
      expect(partial.status).toBe(400);
    });

    it('shows the desk what each paired device is told, or that it is told nothing', async () => {
      const { cookie, device } = await pair();
      const quiet = await pair();
      await subscribe(cookie);
      await viaTailscale('/p/memory-aaaaaa/api/notify/prefs', {
        method: 'POST',
        cookie,
        body: { prefs: { ...DEFAULT_PREFS, stuck: false, muted: ['other-bbbbbb'] }, lang: 'es' },
      });

      const lan = (await (await desk('/p/memory-aaaaaa/api/lan')).json()) as {
        devices: { id: string; notify: unknown }[];
      };

      expect(lan.devices.find(({ id }) => id === device)?.notify).toEqual({
        ...DEFAULT_PREFS,
        stuck: false,
        muted: ['other-bbbbbb'],
      });
      expect(lan.devices.find(({ id }) => id === quiet.device)?.notify).toBeNull();
    });

    it('unsubscribes a phone when it is unpaired', async () => {
      const { cookie, device } = await pair();
      await subscribe(cookie);
      const revoked = await desk(`/p/memory-aaaaaa/api/devices/${device}/revoke`, {
        method: 'POST',
        body: {},
      });
      expect(revoked.status).toBe(200);
      expect(listTargets(server.machine)).toEqual([]);
    });

    it('keeps the desktop app’s prefs for this computer’s signed-in browser only', async () => {
      expect(await (await desk('/p/memory-aaaaaa/api/notify')).json()).toMatchObject({
        target: 'desktop',
        key: null,
      });
      const prefs = { ...DEFAULT_PREFS, stuck: false };
      const saved = await desk('/p/memory-aaaaaa/api/notify/prefs', {
        method: 'POST',
        body: { prefs, lang: 'es' },
      });
      expect(await saved.json()).toMatchObject({ target: 'desktop', prefs });
      const unsigned = await desk('/p/memory-aaaaaa/api/notify/prefs', {
        method: 'POST',
        cookie: '',
        body: { prefs, lang: 'es' },
      });
      expect(unsigned.status).toBe(401);
    });

    it('lets only this computer listen to the desktop app’s notices', async () => {
      const { cookie } = await pair();
      expect((await viaTailscale('/p/memory-aaaaaa/api/notify/stream', { cookie })).status).toBe(
        403,
      );
    });
  });

  describe('on the local network’s plain HTTP', () => {
    it('gives no key and says notifications need HTTPS', async () => {
      server.close();
      server = createServer(project, {
        token: TOKEN,
        lan: { addresses: ['192.168.1.20'] },
        notify: { sender },
      });
      const lan = (path: string, call: Call = {}) => {
        const headers: Record<string, string> = { host: '192.168.1.20:4400' };
        if (call.cookie) headers.cookie = call.cookie;
        if (call.body !== undefined) {
          headers['content-type'] = 'application/json';
          headers.origin = 'http://192.168.1.20:4400';
        }
        const init = {
          method: call.method ?? 'GET',
          headers,
          ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
        };
        return Promise.resolve(
          server.app.request(path, init, {
            incoming: { socket: { remoteAddress: '192.168.1.30' } },
          }),
        );
      };
      const code = formatCode(server.phone.codes.issue().code);
      const paired = await lan('/api/pair', { method: 'POST', body: { code, name: 'Phone' } });
      const cookie = /otea_device_4400=[^;]+/.exec(paired.headers.get('set-cookie') ?? '')?.[0];

      expect(await (await lan('/p/memory-aaaaaa/api/notify', { cookie })).json()).toMatchObject({
        key: null,
      });
      const refused = await lan('/p/memory-aaaaaa/api/notify/subscribe', {
        method: 'POST',
        cookie,
        body: { endpoint: endpoint(), keys: browserKeys(), lang: 'es' },
      });
      expect(refused.status).toBe(409);
      expect(await errorOf(refused)).toBe('push_needs_https');
    });
  });

  describe('who is told what', () => {
    let first: string;

    beforeEach(async () => {
      first = newTask('Ship the login');
      const { cookie } = await pair();
      await subscribe(cookie);
    });

    it('pushes to the phone when something becomes yours, after a moment, once', async () => {
      toReview(first);
      await pass(1000);
      expect(sent).toEqual([]);
      await pass(GATHER_MS);
      expect(sent).toEqual([
        {
          subscription: expect.objectContaining({ endpoint: endpoint() }),
          payload: {
            title: 'memory · Te toca',
            body: `${first} · Ship the login`,
            tag: `otea-item-${first}`,
            url: `/p/memory-aaaaaa/#/i/${first}`,
            item: first,
          },
        },
      ]);
      await pass(GATHER_MS);
      expect(sent).toHaveLength(1);
    });

    it('tells nothing of what was already yours when the phone subscribed', async () => {
      server.close();
      toReview(first);
      server = createServer(project, {
        token: TOKEN,
        tailscale: fakeTailscale(),
        now: () => clock,
        notify: { sender, tickMs: 60 * 60_000 },
      });
      await pass(GATHER_MS);
      await pass(GATHER_MS);
      expect(sent).toEqual([]);
    });

    it('says an item got stuck when its agent goes quiet with the lease', async () => {
      claimItem(project, { id: first, actor: { kind: 'agent', name: 'codex' }, ttlMs: 60_000 }, at);
      await pass(1000);
      await pass(60_000);
      await pass(GATHER_MS);
      expect(sent.map(({ payload }) => payload.title)).toEqual([
        'memory · Se atascó · codex no responde',
      ]);
    });

    it('leaves out a kind the phone turned off', async () => {
      const { cookie } = await pair();
      await subscribe(cookie, 2);
      await viaTailscale('/p/memory-aaaaaa/api/notify/prefs', {
        method: 'POST',
        cookie,
        body: { prefs: { ...DEFAULT_PREFS, turn: false }, lang: 'es' },
      });
      toReview(first);
      await pass(1000);
      await pass(GATHER_MS);
      expect(sent.map(({ subscription }) => subscription.endpoint)).toEqual([endpoint(1)]);
    });

    const choose = (cookie: string | undefined, prefs: Partial<typeof DEFAULT_PREFS>) =>
      viaTailscale('/p/memory-aaaaaa/api/notify/prefs', {
        method: 'POST',
        cookie,
        body: { prefs: { ...DEFAULT_PREFS, ...prefs }, lang: 'es' },
      });

    it('tells nothing from a project the phone muted', async () => {
      const { cookie } = await pair();
      await subscribe(cookie, 2);
      await choose(cookie, { muted: ['memory-aaaaaa'] });
      toReview(first);
      await pass(1000);
      await pass(GATHER_MS);
      expect(sent.map(({ subscription }) => subscription.endpoint)).toEqual([endpoint(1)]);
    });

    it('tells that an agent set an item aside only to a phone that asked for it', async () => {
      const { cookie } = await pair();
      await subscribe(cookie, 2);
      await choose(cookie, { aside: true });
      claimItem(project, { id: first, actor: claude }, at);
      await pass(1000);
      releaseItem(project, { id: first, actor: claude, later: true }, at);
      await pass(1000);
      await pass(GATHER_MS);
      expect(sent).toEqual([
        expect.objectContaining({
          subscription: expect.objectContaining({ endpoint: endpoint(2) }),
          payload: expect.objectContaining({ title: 'memory · claude lo dejó para después' }),
        }),
      ]);
    });

    it('gathers what many agents hand over into one notice now and then, naming the project', async () => {
      toReview(first);
      await pass(1000);
      await pass(GATHER_MS);
      expect(sent).toHaveLength(1);
      for (const title of ['Two', 'Three', 'Four']) {
        toReview(newTask(title));
        await pass(20_000);
      }
      expect(sent).toHaveLength(1);
      await pass(SPACING_MS);
      expect(sent).toHaveLength(2);
      expect(sent[1]?.payload).toMatchObject({
        title: '3 cosas te tocan en memory',
        body: 'Two · Three · Four',
        tag: 'otea-group-memory-aaaaaa',
        url: '/p/memory-aaaaaa/#/',
      });
    });

    it('forgets a subscription the push service says is gone', async () => {
      answer = { result: 'gone', status: 410, detail: '' };
      toReview(first);
      await pass(1000);
      await pass(GATHER_MS);
      expect(sent).toHaveLength(1);
      expect(listTargets(server.machine)).toEqual([]);
    });

    it('logs each push’s outcome with the device id only, never its endpoint, keys or words', async () => {
      const outcomes: [PushOutcome, RegExp][] = [
        [{ result: 'sent', status: 201, detail: '' }, /push to device [0-9a-f]{8}: sent \(201\)/],
        [
          { result: 'failed', status: 403, detail: 'bad key' },
          /push to device [0-9a-f]{8}: refused by the push service \(403\): bad key/,
        ],
        [
          { result: 'failed', status: null, detail: 'fetch failed (ENOTFOUND)' },
          /push to device [0-9a-f]{8}: network error: fetch failed \(ENOTFOUND\)/,
        ],
        [
          { result: 'gone', status: 410, detail: '' },
          /push to device [0-9a-f]{8}: gone \(410\), subscription dropped/,
        ],
      ];
      for (const [outcome, line] of outcomes) {
        answer = outcome;
        logged.length = 0;
        const id = newTask(`Item ${outcome.status}`);
        toReview(id);
        await pass(SPACING_MS);
        await pass(SPACING_MS);
        expect(logged.join('\n')).toMatch(line);
      }
      const all = logged.join('\n');
      expect(all).not.toContain('fcm.googleapis.com');
      expect(all).not.toContain('Item');
    });
  });

  describe('a test push', () => {
    it('sends one push to the phone right away, past the quiet hours and the spacing', async () => {
      const { cookie, device } = await pair();
      await subscribe(cookie);
      const prefs = { ...DEFAULT_PREFS, quiet: { from: '00:00', to: '23:59' } };
      await viaTailscale('/p/memory-aaaaaa/api/notify/prefs', {
        method: 'POST',
        cookie,
        body: { prefs, lang: 'es' },
      });

      const fromPhone = await viaTailscale('/p/memory-aaaaaa/api/notify/test', {
        method: 'POST',
        cookie,
        body: {},
      });
      expect(fromPhone.status).toBe(200);
      expect(await fromPhone.json()).toEqual({ result: 'sent', status: 201, detail: '' });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.payload).toMatchObject({ title: 'Otea · aviso de prueba', url: '/#/' });

      const fromDesk = await desk(`/api/devices/${device}/test-push`, { method: 'POST', body: {} });
      expect(await fromDesk.json()).toEqual({ result: 'sent', status: 201, detail: '' });
      expect(sent).toHaveLength(2);
      expect(logged.join('\n')).toContain(`test push to device ${device}: sent (201)`);
    });

    it('says what the push service answered, and drops a subscription it calls gone', async () => {
      const { cookie, device } = await pair();
      await subscribe(cookie);
      answer = { result: 'failed', status: 403, detail: 'bad key' };
      const refused = await desk(`/api/devices/${device}/test-push`, { method: 'POST', body: {} });
      expect(await refused.json()).toEqual({ result: 'failed', status: 403, detail: 'bad key' });

      answer = { result: 'gone', status: 410, detail: '' };
      await desk(`/api/devices/${device}/test-push`, { method: 'POST', body: {} });
      expect(listTargets(server.machine)).toEqual([]);
    });

    it('says a device without notifications on has nothing to send to', async () => {
      const { cookie, device } = await pair();
      const fromDesk = await desk(`/api/devices/${device}/test-push`, { method: 'POST', body: {} });
      expect(await fromDesk.json()).toEqual({ result: 'off', status: null, detail: '' });
      const fromPhone = await viaTailscale('/p/memory-aaaaaa/api/notify/test', {
        method: 'POST',
        cookie,
        body: {},
      });
      expect(await fromPhone.json()).toMatchObject({ result: 'off' });
      expect(sent).toEqual([]);
      const unknown = await desk('/api/devices/nope/test-push', { method: 'POST', body: {} });
      expect(unknown.status).toBe(404);
    });
  });

  describe('the desktop app', () => {
    it('hears the same notices on its stream, in its language', async () => {
      const id = newTask('Ship the login');
      const response = await desk('/p/memory-aaaaaa/api/notify/stream?lang=en', {
        cookie: undefined,
      });
      expect(response.status).toBe(200);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let text = '';
      const until = async (needle: string) => {
        while (!text.includes(needle)) {
          const chunk = await reader?.read();
          if (!chunk || chunk.done) break;
          text += decoder.decode(chunk.value);
        }
      };
      await until('event: ready');
      toReview(id);
      await pass(1000);
      await pass(GATHER_MS);
      await until('event: notice');
      const data = /event: notice\ndata: (.+)\n/.exec(text)?.[1] ?? '{}';
      expect(JSON.parse(data)).toMatchObject({
        title: 'memory · Your turn',
        url: `/p/memory-aaaaaa/#/i/${id}`,
      });
      await reader?.cancel();
    });
  });
});
