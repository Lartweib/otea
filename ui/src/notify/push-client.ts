import { postSubscription, postUnsubscribe } from '../api.ts';
import { isStandalone, platformOf } from '../home-screen.ts';
import type { Language } from '../i18n/i18n.ts';
import { isDesktopApp, type NotifyPlace, type NotifyView } from './offer.ts';

// The browser's side of Web Push: asking for permission, subscribing with the project's key on the
// service worker the installed app registered (offline/register.ts), and telling the PC.

export function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(given: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!given) return false;
  const bytes = new Uint8Array(given);
  return bytes.length === key.length && bytes.every((byte, i) => byte === key[i]);
}

export function placeHere(view: NotifyView): NotifyPlace {
  const hasPush =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  return {
    target: view.target,
    key: view.key,
    desktopApp: isDesktopApp(navigator.userAgent),
    hasPush,
    platform: platformOf(navigator.userAgent, navigator.maxTouchPoints),
    standalone: isStandalone(window.matchMedia, navigator),
    permission: 'Notification' in window ? Notification.permission : 'unknown',
  };
}

export type SubscribeOutcome = { view: NotifyView } | { refused: 'blocked' | 'failed' };

// Asks for permission (from the tap that turns them on: iOS asks only then), subscribes, and
// sends the subscription to the PC.
export async function subscribeHere(key: string, lang: Language): Promise<SubscribeOutcome> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { refused: permission === 'denied' ? 'blocked' : 'failed' };
  try {
    const registration = await navigator.serviceWorker.ready;
    const serverKey = keyBytes(key);
    let subscription = await registration.pushManager.getSubscription();
    // One made with another key (the project's keys were made again) cannot be reused.
    if (subscription && !sameKey(subscription.options.applicationServerKey, serverKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey,
    });
    const { endpoint, keys } = subscription.toJSON();
    if (!endpoint || !keys?.p256dh || !keys.auth) return { refused: 'failed' };
    const view = await postSubscription(
      { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      lang,
    );
    return { view };
  } catch {
    return { refused: 'failed' };
  }
}

export async function unsubscribeHere(): Promise<NotifyView> {
  const view = await postUnsubscribe();
  try {
    const registration = await navigator.serviceWorker.ready;
    await (await registration.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // The PC no longer pushes to it either way.
  }
  return view;
}
