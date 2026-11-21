// Otea on a phone's home screen: a manifest and icons everywhere; no service worker over the LAN's
// plain HTTP (browsers refuse one on an insecure origin), one over HTTPS (offline/register.ts).
// These are the pieces the pairing screen and Preferencias read.

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

// One installed app opens every project (TS-30): every page keeps index.html's one manifest and
// Safari's title, both «Otea», so the app has the same name wherever it was added from.

// Otea ran from the home screen on this phone, or the browser said it installed it: a browser tab
// then never offers to install it again (TS-16). On Android the tab and the installed app share
// their storage; iOS keeps them apart, and there the tab cannot know.
export const INSTALLED_KEY = 'otea.installed';

export function noteInstalled(store: Store | undefined): void {
  try {
    store?.setItem(INSTALLED_KEY, '1');
  } catch {
    // nowhere to keep it: the banner may show in a tab again
  }
}

export function knownInstalled(store: Store | undefined): boolean {
  try {
    return store?.getItem(INSTALLED_KEY) === '1';
  } catch {
    return false;
  }
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
