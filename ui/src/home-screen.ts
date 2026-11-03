// Otea on a phone's home screen, over plain HTTP on the LAN: a manifest and icons, no service worker
// (browsers refuse one on an insecure origin). These are the pieces the pairing screen reads.

type Media = (query: string) => { matches: boolean };

// Opened from the home screen rather than in the browser: the display mode the manifest asks for,
// or Safari's own flag on iOS.
export function isStandalone(matchMedia: Media, nav: object): boolean {
  const safari = (nav as { standalone?: unknown }).standalone;
  return matchMedia('(display-mode: standalone)').matches || safari === true;
}

export type Platform = 'ios' | 'android' | 'other';

// iPadOS asks for desktop pages and says Macintosh; a touch screen gives it away.
export function platformOf(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return /Android/.test(userAgent) ? 'android' : 'other';
}

export const HOME_HINT_KEY = 'otea.homeScreenHint';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

// The "add to home screen" hint, until it is dismissed on this browser.
export function hintDismissed(store: Store | undefined): boolean {
  try {
    return store?.getItem(HOME_HINT_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function dismissHint(store: Store | undefined): void {
  try {
    store?.setItem(HOME_HINT_KEY, 'dismissed');
  } catch {
    // Private mode or blocked storage: the hint shows again next time, nothing else changes.
  }
}

export function browserStore(): Store | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
