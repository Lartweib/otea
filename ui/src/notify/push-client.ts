import { fetchNotify, postLost, postSubscription, postUnsubscribe } from '../api.ts';
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

export type LocalPush = { permission: string; subscribed: boolean | null };

// What this browser holds for push now: its permission, and whether its service worker still has a
// subscription (null when it cannot tell: no service worker yet). Android can block an installed
// app's notifications on its own, apart from the browser's permission, and the page cannot read
// that switch; blocking and allowing them again there leaves the browser with no subscription.
export async function localPush(): Promise<LocalPush> {
  const permission =
    typeof Notification === 'undefined' ? 'unknown' : String(Notification.permission);
  try {
    if (!('serviceWorker' in navigator)) return { permission, subscribed: null };
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return { permission, subscribed: null };
    const subscription = await registration.pushManager.getSubscription();
    return { permission, subscribed: subscription !== null };
  } catch {
    return { permission, subscribed: null };
  }
}

// The server pushes to a subscription this browser no longer has (TS-3): every push "arrives" at a
// dead end, and the desk counts notifications as on.
export function staleSubscription(view: NotifyView, here: LocalPush): boolean {
  return view.target === 'device' && view.subscribed && here.subscribed === false;
}

// Android blocks what the server still sends: the permission is denied. Only a read made after the
// last change of the subscription counts (`changedAt`), so a read from before Activar avisos never
// shows the red line at the moment of success (TS-7).
export function blockedHereOf(
  view: NotifyView,
  here: (LocalPush & { at: number }) | null,
  changedAt: number,
): boolean {
  if (here === null || here.at < changedAt) return false;
  return view.target === 'device' && view.subscribed && here.permission === 'denied';
}

// What the phone remembers once the server dropped a lost subscription: that it did (Preferencias
// says notifications stopped here) and the choices it had, given back when they are turned on again.
export const PUSH_LOST_KEY = 'otea.pushLost';

function lostStore(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function lostPrefs(): NotifyView['prefs'] | null {
  try {
    const kept = lostStore()?.getItem(PUSH_LOST_KEY);
    return kept ? (JSON.parse(kept) as NotifyView['prefs']) : null;
  } catch {
    return null;
  }
}

export function forgetLost(): void {
  try {
    lostStore()?.removeItem(PUSH_LOST_KEY);
  } catch {
    // nothing kept
  }
}

// Tells the server this browser has no subscription, so it stops pushing to the dead one and the
// desk no longer counts notifications as on; the server keeps that it was lost, with its choices.
// Returns the server's new view, or null when nothing was stale (or the server could not be told).
export async function dropIfStale(view: NotifyView, here: LocalPush): Promise<NotifyView | null> {
  if (!staleSubscription(view, here)) return null;
  try {
    const next = await postLost();
    try {
      lostStore()?.setItem(PUSH_LOST_KEY, JSON.stringify(view.prefs));
    } catch {
      // the warning shows for this open only
    }
    return next;
  } catch {
    return null;
  }
}

// As the installed app opens and comes back to the front: the lost subscription is told to the
// server even before Preferencias opens.
export async function reconcilePush(): Promise<void> {
  try {
    const view = await fetchNotify(new AbortController().signal);
    if (!view || typeof view !== 'object' || !('target' in view)) return;
    await dropIfStale(view, await localPush());
  } catch {
    // The PC does not answer: the next open tries again.
  }
}

export function startPushCheck(): void {
  if (typeof window === 'undefined' || !window.isSecureContext || !('PushManager' in window))
    return;
  void reconcilePush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reconcilePush();
  });
}
