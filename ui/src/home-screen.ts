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

// The shortcut a page offers (P7-13): on a project's page its own manifest, which names the shortcut
// after the project and opens it (src/server/ui.ts), and Safari's title; Otea's elsewhere. Set on the
// page, not in index.html: the installed app opens every project from the one cached page.
export function shortcutOf(project: { id: string; name: string } | null): {
  manifest: string;
  title: string;
} {
  return project
    ? { manifest: `/p/${project.id}/manifest.webmanifest`, title: project.name }
    : { manifest: '/manifest.webmanifest', title: 'Otea' };
}

// A browser fetches a manifest without cookies unless its link asks for them; a project's manifest
// waits for the device's cookie (a phone without it is sent to the pairing screen, and its shortcut
// gets no icon), so the link always asks, set before the new address is.
export function offerShortcut(project: { id: string; name: string } | null): void {
  const { manifest, title } = shortcutOf(project);
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link && link.getAttribute('crossorigin') !== 'use-credentials') {
    link.setAttribute('crossorigin', 'use-credentials');
  }
  if (link && link.getAttribute('href') !== manifest) link.setAttribute('href', manifest);
  document
    .querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    ?.setAttribute('content', title);
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
