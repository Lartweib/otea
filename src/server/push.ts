import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
} from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Web Push, as the PC sends it to a paired phone: the payload encrypted for the phone's browser
// (aes128gcm, RFC 8291 over RFC 8188) and the request signed with the project's VAPID key (RFC 8292),
// posted to the push service the browser subscribed with. Written on node:crypto instead of the
// web-push package: the protocol is two small, fixed recipes, and web-push would bring its own
// dependency tree (http_ece, asn1.js, jws, https-proxy-agent) into a CLI that ships six.
//
// The VAPID key pair is made per project, on first use, and kept beside the UI token (mode 0600);
// the public half goes to the phone's browser, which hands it to its push service. Nothing else
// ever leaves this computer but the encrypted payload, and only to a browser's push service.

export type VapidKeys = {
  // The uncompressed P-256 point (65 bytes), base64url: the browser's applicationServerKey.
  publicKey: string;
  // The private scalar (32 bytes), base64url.
  privateKey: string;
};

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

export type PushResult = 'sent' | 'gone' | 'failed';

export type PushSender = {
  send(subscription: PushSubscriptionKeys, payload: string): Promise<PushResult>;
};

export const PUSH_KEYS_FILE = 'push-keys.json';

// Who to reach about this sender, which push services ask for: the project's home, never a person.
const SUBJECT = 'https://github.com/Lartweib/otea';
// A notice that waits a day at the push service is not news any more.
const TTL_SECONDS = 24 * 60 * 60;
const CLAIM_SECONDS = 12 * 60 * 60;
const RECORD_SIZE = 4096;
const SEND_TIMEOUT_MS = 10_000;

const b64 = (text: string) => Buffer.from(text, 'base64url');

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
  };
}

const isKeys = (value: unknown): value is VapidKeys => {
  const keys = value as Partial<VapidKeys> | null;
  return (
    typeof keys?.publicKey === 'string' &&
    typeof keys.privateKey === 'string' &&
    b64(keys.publicKey).length === 65 &&
    b64(keys.privateKey).length === 32
  );
};

export function ensureVapidKeys(dir: string): VapidKeys {
  const path = join(dir, PUSH_KEYS_FILE);
  if (existsSync(path)) {
    try {
      const kept: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (isKeys(kept)) return kept;
    } catch {
      // unreadable: made again below, and phones subscribe again
    }
  }
  const keys = generateVapidKeys();
  writeFileSync(path, `${JSON.stringify(keys)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best effort: some file systems ignore permissions
  }
  return keys;
}

// The push services of the browsers that run Otea's installed app. A subscription names one of
// them; the server posts nowhere else, so a paired device cannot point it at the local network.
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

export function isPushEndpoint(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
}

type SenderKeys = { publicKey: Buffer; privateKey: Buffer };

// The aes128gcm body: salt, record size, the sender's one-time public key, then one record.
export function encryptPayload(
  plaintext: Buffer,
  subscription: PushSubscriptionKeys,
  fixed: { salt?: Buffer; sender?: SenderKeys } = {},
): Buffer {
  const uaPublic = b64(subscription.p256dh);
  const authSecret = b64(subscription.auth);
  const ecdh = createECDH('prime256v1');
  if (fixed.sender) ecdh.setPrivateKey(fixed.sender.privateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = fixed.salt ?? randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: aes128gcm\0', 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: nonce\0', 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // One record, the last: the payload and its delimiter (2).
  const record = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, record]);
}

function signingKey(keys: VapidKeys) {
  const point = b64(keys.publicKey);
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33).toString('base64url'),
    },
    format: 'jwk',
  });
}

const json64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function vapidAuthorization(endpoint: string, keys: VapidKeys, now: number): string {
  const head = json64({ typ: 'JWT', alg: 'ES256' });
  const claims = json64({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + CLAIM_SECONDS,
    sub: SUBJECT,
  });
  const signature = sign('sha256', Buffer.from(`${head}.${claims}`), {
    key: signingKey(keys),
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${head}.${claims}.${signature.toString('base64url')}, k=${keys.publicKey}`;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export function webPushSender(
  keys: VapidKeys,
  options: { fetch?: Fetch; now?: () => number } = {},
): PushSender {
  const post = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? Date.now;
  return {
    async send(subscription, payload) {
      // Not a push service: a subscription that can never be delivered to.
      if (!isPushEndpoint(subscription.endpoint)) return 'gone';
      try {
        const body = encryptPayload(Buffer.from(payload, 'utf8'), subscription);
        const response = await post(subscription.endpoint, {
          method: 'POST',
          headers: {
            authorization: vapidAuthorization(subscription.endpoint, keys, now()),
            'content-encoding': 'aes128gcm',
            'content-type': 'application/octet-stream',
            ttl: String(TTL_SECONDS),
            urgency: 'normal',
          },
          body: new Uint8Array(body),
          redirect: 'error',
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (response.ok) return 'sent';
        // The browser unsubscribed, or the subscription expired: never again.
        return response.status === 404 || response.status === 410 ? 'gone' : 'failed';
      } catch {
        return 'failed';
      }
    },
  };
}
