// While the Windows installer writes the app's files it keeps a flag in Otea's data folder
// (build/installer.nsh). An app started meanwhile, from a shell that did not wait for a silent
// install or by hand, would load files only half written (ERR_FAILED on picker.html): it waits for
// the flag to go first, saying so. Pure: main.ts reads the flag and draws the wait.

// A flag older than this was left by an installer that failed or was stopped: it is no longer
// writing anything. A silent install took 2 min 20 s on a busy machine.
export const INSTALLING_STALE_MS = 10 * 60_000;

const CHECK_MS = 1000;

// Whether an installer is writing the app: its flag, last written at `flagMs` (undefined when
// there is none), is still fresh at `now`.
export function installing(flagMs: number | undefined, now: number): boolean {
  return flagMs !== undefined && now - flagMs < INSTALLING_STALE_MS;
}

// Resolves once no installer is writing the app; `onWaiting` runs once, the first time one is.
export async function untilInstalled(o: {
  installing: () => boolean;
  onWaiting: () => void;
  sleep: (ms: number) => Promise<void>;
}): Promise<void> {
  if (!o.installing()) return;
  o.onWaiting();
  while (o.installing()) await o.sleep(CHECK_MS);
}
