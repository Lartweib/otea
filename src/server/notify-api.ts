import type { DatabaseSync } from 'node:sqlite';
import { type Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  desktopTarget,
  dropSubscription,
  loseSubscription,
  saveDesktopPrefs,
  savePrefs,
  saveSubscription,
  targetOfDevice,
} from '../app/notify-targets.ts';
import { DEFAULT_PREFS, type NotifyPrefs, TIME_PATTERN } from '../core/notify/planner.ts';
import { isNoticeLang, type NoticeLang } from '../core/notify/text.ts';
import { RejectedRequest } from './errors.ts';
import type { Notifier } from './notifier.ts';
import { assertCanManageDevices } from './pairing.ts';
import { isPushEndpoint, type PushSender, type VapidKeys } from './push.ts';
import { clientOf, type OteaEnv, type Session } from './session.ts';
import { sendTestPush } from './test-push.ts';
import { assertSameOrigin, assertWritable } from './writes.ts';

// Preferencias › Avisos, as the server answers it:
// - a paired device over HTTPS subscribes to Web Push with the server's public VAPID key, chooses
//   what it is told and when, and unsubscribes (unpairing it unsubscribes it too);
// - this computer's signed-in browser chooses the desktop app's notices (the desktop app shows
//   them itself, see notifier.ts), and the desktop app listens for them on /api/notify/stream.

export type NotifyView = {
  // Whose notices these are: this device's pushes, or the desktop app's.
  target: 'device' | 'desktop';
  // The key a browser subscribes with; only to a device over HTTPS, where Web Push works.
  key: string | null;
  subscribed: boolean;
  // The subscription was lost without the device choosing it (TS-3): its push service called it
  // gone, or the phone found its browser no longer holds it. Its prefs are kept.
  lost: boolean;
  prefs: NotifyPrefs;
};

const Time = z.string().regex(TIME_PATTERN);

const Prefs = z.object({
  turn: z.boolean(),
  ask: z.boolean(),
  replied: z.boolean(),
  stuck: z.boolean(),
  aside: z.boolean(),
  quiet: z.object({ from: Time, to: Time }).nullable(),
  // The projects muted, by id.
  muted: z.array(z.string().min(1).max(200)).max(500),
});

const Lang = z.enum(['es', 'en']);

const SubscribeBody = z.object({
  endpoint: z.string().max(2048),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  lang: Lang,
});

const PrefsBody = z.object({ prefs: Prefs, lang: Lang });

const bytes = (text: string) => Buffer.from(text, 'base64url').length;

async function body<T>(c: Context, schema: z.ZodType<T>, expected: string): Promise<T> {
  assertSameOrigin(c);
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) throw new RejectedRequest(400, 'invalid_body', `Expected ${expected}`);
  return parsed.data;
}

// The paired device asking, over HTTPS: Web Push needs a secure page, so a device on the local
// network's plain HTTP is told why it cannot.
function pushDevice(c: Context): string {
  const client = clientOf(c);
  if (client.kind !== 'device') {
    throw new RejectedRequest(403, 'forbidden', 'Only a paired device subscribes to push');
  }
  if (!client.secure) {
    throw new RejectedRequest(
      409,
      'push_needs_https',
      'Notifications need the phone on HTTPS; connect it through Tailscale (otea phone tailscale)',
    );
  }
  return client.device.id;
}

function unsubscribingDevice(c: Context): string {
  const client = clientOf(c);
  if (client.kind !== 'device') {
    throw new RejectedRequest(403, 'forbidden', 'Only a paired device unsubscribes from push');
  }
  return client.device.id;
}

function view(c: Context, machine: DatabaseSync, keys: VapidKeys): NotifyView {
  const client = clientOf(c);
  if (client.kind === 'device') {
    const target = targetOfDevice(machine, client.device.id);
    return {
      target: 'device',
      key: client.secure ? keys.publicKey : null,
      subscribed: target?.push != null,
      lost: target !== undefined && target.push === null,
      prefs: target?.prefs ?? DEFAULT_PREFS,
    };
  }
  return {
    target: 'desktop',
    key: null,
    subscribed: true,
    lost: false,
    prefs: desktopTarget(machine).prefs,
  };
}

export function notifyApi(
  machine: DatabaseSync,
  notifier: Notifier,
  keys: VapidKeys,
  auth: Session,
  push: { sender: PushSender; log: (line: string) => void },
): Hono<OteaEnv> {
  return (
    new Hono<OteaEnv>()
      .get('/notify', (c) => c.json(view(c, machine, keys)))
      .post('/notify/subscribe', async (c) => {
        assertWritable(c, auth);
        const device = pushDevice(c);
        const {
          endpoint,
          keys: subscription,
          lang,
        } = await body(
          c,
          SubscribeBody,
          '{"endpoint": string, "keys": {"p256dh": string, "auth": string}, "lang": "es" | "en"}',
        );
        if (!isPushEndpoint(endpoint)) {
          throw new RejectedRequest(400, 'invalid_body', 'The endpoint is not a push service');
        }
        if (bytes(subscription.p256dh) !== 65 || bytes(subscription.auth) !== 16) {
          throw new RejectedRequest(400, 'invalid_body', 'The subscription keys do not read');
        }
        saveSubscription(machine, device, { endpoint, ...subscription }, lang);
        notifier.refresh();
        return c.json(view(c, machine, keys), 201);
      })
      // Preferencias › Avisos › Enviar un aviso de prueba: one push to this device now, past the
      // planner, the quiet hours and the spacing, with what its push service answered.
      .post('/notify/test', async (c) => {
        assertWritable(c, auth);
        assertSameOrigin(c);
        const device = pushDevice(c);
        const answer = await sendTestPush(machine, push.sender, device, push.log);
        if (answer.result === 'gone') notifier.refresh();
        return c.json(answer);
      })
      .post('/notify/unsubscribe', (c) => {
        assertWritable(c, auth);
        assertSameOrigin(c);
        dropSubscription(machine, unsubscribingDevice(c));
        notifier.refresh();
        return c.json(view(c, machine, keys));
      })
      // The phone's browser no longer holds the subscription the server pushes to (TS-3).
      .post('/notify/lost', (c) => {
        assertWritable(c, auth);
        assertSameOrigin(c);
        loseSubscription(machine, unsubscribingDevice(c));
        notifier.refresh();
        return c.json(view(c, machine, keys));
      })
      .post('/notify/prefs', async (c) => {
        assertWritable(c, auth);
        const { prefs, lang } = await body(
          c,
          PrefsBody,
          '{"prefs": {"turn", "ask", "replied", "stuck", "aside": boolean, "quiet": {"from": "HH:MM", "to": "HH:MM"} | null, "muted": [project id]}, "lang": "es" | "en"}',
        );
        const client = clientOf(c);
        if (client.kind === 'device') savePrefs(machine, client.device.id, prefs, lang);
        else {
          assertCanManageDevices(c, auth);
          saveDesktopPrefs(machine, prefs, lang);
        }
        return c.json(view(c, machine, keys));
      })
      // The desktop app's notices, as server-sent events; for this computer only.
      .get('/notify/stream', (c) => {
        if (clientOf(c).kind !== 'local') {
          throw new RejectedRequest(
            403,
            'forbidden',
            'Only the desktop app on this computer listens',
          );
        }
        const asked = c.req.query('lang');
        const lang: NoticeLang = isNoticeLang(asked) ? asked : 'en';
        return streamSSE(c, async (stream) => {
          const { promise: ended, resolve } = Promise.withResolvers<void>();
          const stop = notifier.listenDesktop(
            (text) => void stream.writeSSE({ event: 'notice', data: JSON.stringify(text) }),
            lang,
            resolve,
          );
          stream.onAbort(() => {
            stop();
            resolve();
          });
          await stream.writeSSE({ event: 'ready', data: '' });
          await ended;
        });
      })
  );
}
