// The installed app's service worker (sw.ts): registered only where it can work and is wanted.
// A browser refuses one on plain HTTP (the local network): there the app works while the PC is on
// and promises nothing more. The desktop app (Electron) is the PC itself: it never needs one.
//
// Updates apply by themselves on the next open: the browser checks sw.js on every open; a new
// version installs in the background and waits; when the app goes to the background (or opens
// with one already waiting) it takes over and the page reloads out of sight. The first look at a
// version the app has not run before says, quietly, "Otea se actualizó".

export type Where = { secure: boolean; hasWorker: boolean; userAgent: string };

export function offlineCapable({ secure, hasWorker, userAgent }: Where): boolean {
  return secure && hasWorker && !/\bElectron\//.test(userAgent);
}

export function here(): Where {
  return {
    secure: typeof window !== 'undefined' && window.isSecureContext,
    hasWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  };
}

export const VERSION_KEY = 'otea.version';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

// The version running now, against the last one this browser ran: true once, on the first look at
// a new one. Never on the first version it ever runs (an install is not an update).
export function noteVersion(store: Store | undefined, version: string): boolean {
  try {
    const before = store?.getItem(VERSION_KEY) ?? null;
    if (before === version) return false;
    store?.setItem(VERSION_KEY, version);
    return before !== null;
  } catch {
    return false;
  }
}

const SKIP_WAITING = { type: 'skip-waiting' };
const ASK_VERSION = { type: 'version' };
// How often a long-lived app (a phone keeps it in memory for days) asks for a new version.
const CHECK_EVERY_MS = 60 * 60 * 1000;
// The first moments after opening count as the opening: a reload then goes unnoticed.
const BOOT_MS = 4000;

function storage(): Store | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// Android offers its own install prompt: kept for Preferencias' line instead of Chrome's banner.
type InstallPrompt = Event & { prompt(): Promise<unknown> };
let installPrompt: InstallPrompt | null = null;

export const canPromptInstall = (): boolean => installPrompt !== null;

export function promptInstall(): void {
  const event = installPrompt;
  installPrompt = null;
  void event?.prompt().catch(() => undefined);
}

export async function startShell(
  onUpdated: () => void,
): Promise<ServiceWorkerRegistration | undefined> {
  if (!offlineCapable(here())) return undefined;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
  });
  const sw = navigator.serviceWorker;
  let registration: ServiceWorkerRegistration;
  try {
    registration = await sw.register('/sw.js', { updateViaCache: 'none' });
  } catch {
    return undefined;
  }
  const apply = (worker: ServiceWorker) => worker.postMessage(SKIP_WAITING);
  // Out of sight (in the background, or, with `opening`, a moment after opening), now; otherwise
  // once it is.
  const whenQuiet = (act: () => void, opening = false) => {
    const quiet = document.visibilityState === 'hidden' || (opening && performance.now() < BOOT_MS);
    if (quiet) return act();
    const off = () => {
      if (document.visibilityState !== 'hidden') return;
      document.removeEventListener('visibilitychange', off);
      act();
    };
    document.addEventListener('visibilitychange', off);
  };
  // A new version took over (this page asked, or another): the page reloads into it, out of
  // sight, and the next look says so. Never on the first install, which changes nothing on screen.
  const updating = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (updating) whenQuiet(() => window.location.reload(), true);
  });
  // The version this page runs on: the one that controls it says.
  sw.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: unknown; version?: unknown } | null;
    if (data?.type === 'version' && typeof data.version === 'string') {
      if (noteVersion(storage(), data.version)) onUpdated();
    }
  });
  sw.controller?.postMessage(ASK_VERSION);
  // One already waiting as the app opens: this open is the next open.
  if (registration.waiting && sw.controller) apply(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && sw.controller) whenQuiet(() => apply(worker));
    });
  });
  let checked = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - checked < CHECK_EVERY_MS) return;
    checked = Date.now();
    registration.update().catch(() => undefined);
  });
  return registration;
}

// Android sends the queue from the background too (Background Sync); iOS has none, and the page
// sends it as it opens, comes back or goes online (queue-store.ts).
export const SYNC_TAG = 'otea-captures';

export async function askBackgroundSync(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.ready;
    const sync = (registration as { sync?: { register(tag: string): Promise<void> } } | undefined)
      ?.sync;
    await sync?.register(SYNC_TAG);
  } catch {
    // No Background Sync here: the page sends the queue itself.
  }
}
