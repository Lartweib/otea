import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  hkdfSync,
  randomBytes,
  verify,
} from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  encryptPayload,
  ensureVapidKeys,
  generateVapidKeys,
  isPushEndpoint,
  PUSH_KEYS_FILE,
  type PushSubscriptionKeys,
  vapidAuthorization,
  webPushSender,
} from './push.ts';

const b64 = (text: string) => Buffer.from(text, 'base64url');

// RFC 8291, Appendix A: the example message, its keys, salt and the body it encrypts to.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

// A browser's side of a subscription: its key pair and auth secret.
function browser() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const subscription: PushSubscriptionKeys = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: auth.toString('base64url'),
  };
  // Decrypts one aes128gcm record as the push service hands it over (RFC 8188, 8291).
  const decrypt = (body: Buffer): string => {
    const salt = body.subarray(0, 16);
    const idlen = body[20] ?? 0;
    const asPublic = body.subarray(21, 21 + idlen);
    const shared = ecdh.computeSecret(asPublic);
    const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]);
    const ikm = Buffer.from(hkdfSync('sha256', shared, auth, info, 32));
    const key = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: aes128gcm\0', 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: nonce\0', 12));
    const record = body.subarray(21 + idlen);
    const decipher = createDecipheriv('aes-128-gcm', key, nonce);
    decipher.setAuthTag(record.subarray(record.length - 16));
    const plain = Buffer.concat([
      decipher.update(record.subarray(0, record.length - 16)),
      decipher.final(),
    ]);
    expect(plain.at(-1)).toBe(2);
    return plain.subarray(0, -1).toString('utf8');
  };
  return { subscription, decrypt };
}

describe('encryptPayload', () => {
  it('encrypts the RFC 8291 example exactly', () => {
    const body = encryptPayload(
      Buffer.from(RFC.plaintext),
      { endpoint: 'https://push.example', p256dh: RFC.uaPublic, auth: RFC.authSecret },
      {
        salt: b64(RFC.salt),
        sender: { publicKey: b64(RFC.asPublic), privateKey: b64(RFC.asPrivate) },
      },
    );
    expect(body.toString('base64url')).toBe(RFC.body);
  });

  it('gives a body only the subscribed browser opens', () => {
    const { subscription, decrypt } = browser();
    const body = encryptPayload(Buffer.from('{"title":"Te toca"}'), subscription);
    expect(decrypt(body)).toBe('{"title":"Te toca"}');
  });
});

describe('vapidAuthorization', () => {
  it('signs a short-lived claim for the push service’s origin with the project’s key', () => {
    const keys = generateVapidKeys();
    const now = Date.parse('2026-11-14T10:00:00.000Z');
    const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, now);
    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header) ?? [];
    expect(key).toBe(keys.publicKey);
    const [head, claims, signature] = (token ?? '').split('.');
    expect(JSON.parse(b64(head ?? '').toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(b64(claims ?? '').toString())).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now / 1000 + 12 * 60 * 60,
      sub: 'https://github.com/Lartweib/otea',
    });
    const raw = b64(keys.publicKey);
    const publicKey = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: raw.subarray(1, 33).toString('base64url'),
        y: raw.subarray(33).toString('base64url'),
      },
      format: 'jwk',
    });
    const signed = Buffer.from(`${head}.${claims}`);
    expect(
      verify('sha256', signed, { key: publicKey, dsaEncoding: 'ieee-p1363' }, b64(signature ?? '')),
    ).toBe(true);
  });
});

describe('isPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('takes the browsers’ push services: %s', (url) => {
    expect(isPushEndpoint(url)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://127.0.0.1/x',
    'https://192.168.1.10/push',
    'https://evil.example/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.example/x',
    'not a url',
  ])('refuses anything else: %s', (url) => {
    expect(isPushEndpoint(url)).toBe(false);
  });
});

describe('webPushSender', () => {
  const keys = generateVapidKeys();
  const calls: { url: string; init: RequestInit }[] = [];
  let status = 201;
  const sender = webPushSender(keys, {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status });
    },
    now: () => Date.parse('2026-11-14T10:00:00.000Z'),
  });

  beforeEach(() => {
    calls.length = 0;
    status = 201;
  });

  it('posts the encrypted payload to the subscription’s push service', async () => {
    const { subscription, decrypt } = browser();
    expect(await sender.send(subscription, '{"title":"Te toca"}')).toBe('sent');
    const [call] = calls;
    expect(call?.url).toBe(subscription.endpoint);
    const headers = new Headers(call?.init.headers);
    expect(headers.get('content-encoding')).toBe('aes128gcm');
    expect(headers.get('ttl')).toBe(String(24 * 60 * 60));
    expect(headers.get('authorization')).toMatch(/^vapid t=/);
    expect(decrypt(Buffer.from(call?.init.body as Uint8Array))).toBe('{"title":"Te toca"}');
  });

  it.each([
    [404, 'gone'],
    [410, 'gone'],
    [500, 'failed'],
    [429, 'failed'],
  ] as const)('reads %i as %s', async (code, result) => {
    status = code;
    expect(await sender.send(browser().subscription, '{}')).toBe(result);
  });

  it('never posts outside the push services', async () => {
    const { subscription } = browser();
    expect(await sender.send({ ...subscription, endpoint: 'https://10.0.0.1/x' }, '{}')).toBe(
      'gone',
    );
    expect(calls).toEqual([]);
  });

  it('counts a network failure as failed', async () => {
    const failing = webPushSender(keys, {
      fetch: async () => {
        throw new Error('offline');
      },
    });
    expect(await failing.send(browser().subscription, '{}')).toBe('failed');
  });
});

describe('ensureVapidKeys', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'otea-push-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('makes the project’s keys once, kept to its owner, and reads them back after', () => {
    const made = ensureVapidKeys(dir);
    expect(b64(made.publicKey)).toHaveLength(65);
    expect(b64(made.privateKey)).toHaveLength(32);
    expect(ensureVapidKeys(dir)).toEqual(made);
    expect(JSON.parse(readFileSync(join(dir, PUSH_KEYS_FILE), 'utf8'))).toEqual(made);
    if (process.platform !== 'win32') {
      expect(statSync(join(dir, PUSH_KEYS_FILE)).mode & 0o777).toBe(0o600);
    }
  });
});
