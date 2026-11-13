// The installed app's service worker (sw.ts): registered only where it can work and is wanted.
// A browser refuses one on plain HTTP (the local network): there the app works while the PC is on
// and promises nothing more. The desktop app (Electron) is the PC itself: it never needs one.
//
// Updates apply by themselves on the next open: the browser checks sw.js on every open; a new
// version installs in the background and waits; when the app goes to the background (or opens
// with one already waiting) it takes over and the page reloads out of sight, and the next look
// says, quietly, "Otea se actualizó".

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

export const UPDATED_KEY = 'otea.updated';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Whether this load is the first after an update; the note shows once.
export function takeUpdatedNote(store: Store | undefined): boolean {
  try {
    if (store?.getItem(UPDATED_KEY) !== '1') return false;
    store.removeItem(UPDATED_KEY);
    return true;
  } catch {
    return false;
  }
}

function markUpdated(store: Store | undefined): void {
  try {
    store?.setItem(UPDATED_KEY, '1');
  } catch {
    // Storage off: the update still applies, without its note.
  }
}

const SKIP_WAITING = { type: 'skip-waiting' };
// How often a long-lived app (a phone keeps it in memory for days) asks for a new version.
const CHECK_EVERY_MS = 60 * 60 * 1000;

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

export async function startShell(): Promise<ServiceWorkerRegistration | undefined> {
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
  let asked = false;
  const apply = (worker: ServiceWorker) => {
    asked = true;
    markUpdated(storage());
    worker.postMessage(SKIP_WAITING);
  };
  sw.addEventListener('controllerchange', () => {
    if (asked) window.location.reload();
  });
  const whenHidden = (worker: ServiceWorker) => {
    if (document.visibilityState === 'hidden') return apply(worker);
    const off = () => {
      if (document.visibilityState !== 'hidden') return;
      document.removeEventListener('visibilitychange', off);
      apply(worker);
    };
    document.addEventListener('visibilitychange', off);
  };
  // One already waiting as the app opens: this open is the next open.
  if (registration.waiting && sw.controller) apply(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && sw.controller) whenHidden(worker);
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
