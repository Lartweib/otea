import type { NotifyPrefs } from '../../../src/core/notify/planner.ts';
import type { Platform } from '../home-screen.ts';

// What Preferencias › Avisos offers here. Notifications reach the phone (Web Push, which browsers
// allow only on HTTPS, and on iPhone only to an app on the home screen) and the desktop app (the
// system's own notifications). A plain browser on this computer is neither: it offers nothing.

// GET /api/notify: whose notices, the key to subscribe with, and what they are told.
export type NotifyView = {
  target: 'device' | 'desktop';
  key: string | null;
  subscribed: boolean;
  prefs: NotifyPrefs;
};

export type NotifyPlace = {
  // Whose notices the server says these are (GET /api/notify).
  target: 'device' | 'desktop';
  // The key to subscribe with: given only to a paired device on HTTPS.
  key: string | null;
  // Running in the desktop app (Electron).
  desktopApp: boolean;
  // This browser has Web Push (PushManager on a service worker).
  hasPush: boolean;
  platform: Platform;
  // Opened from the home screen.
  standalone: boolean;
  permission: NotificationPermission | 'unknown';
};

export type NotifyOffer =
  | 'desktop'
  | 'push'
  | 'needs-https'
  | 'needs-home-screen'
  | 'unsupported'
  | 'blocked';

export function notifyOffer(place: NotifyPlace): NotifyOffer | null {
  if (place.target === 'desktop') return place.desktopApp ? 'desktop' : null;
  if (place.key === null) return 'needs-https';
  // Safari on iPhone has Web Push only for an app added to the home screen.
  if (place.platform === 'ios' && !place.standalone) return 'needs-home-screen';
  if (!place.hasPush) return 'unsupported';
  return place.permission === 'denied' ? 'blocked' : 'push';
}

export const isDesktopApp = (userAgent: string): boolean => /\bElectron\//.test(userAgent);
