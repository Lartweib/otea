// When the app looks for a newer Otea and what it says about it. electron-updater does the work
// behind UpdaterPort (wired in main.ts); this decides when, and keeps it quiet: a check at start
// and every few hours, the download in the background, then a small notice. Nothing restarts the
// app but the person: an update downloaded is applied when Otea next quits.

// Resolves to the newer version on the update feed, or undefined when this is the latest.
export type UpdaterPort = {
  check(): Promise<string | undefined>;
  download(): Promise<void>;
};

// `restart`: downloaded, a restart applies it. `download`: the app cannot apply it itself (an
// unsigned Mac), so it points at the release page.
export type Notice =
  | { kind: 'restart'; version: string }
  | { kind: 'download'; version: string; url: string };

export type UpdateMode = 'off' | 'install' | 'notify';

export const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

// macOS refuses to apply an update to an app that is not signed, so an unsigned Mac build only
// says a newer one exists. A development run (not packaged) has no feed to check.
export function updateMode(build: {
  packaged: boolean;
  platform: NodeJS.Platform;
  macSigned: boolean;
}): UpdateMode {
  if (!build.packaged) return 'off';
  if (build.platform === 'darwin' && !build.macSigned) return 'notify';
  return 'install';
}

export type UpdateOptions = {
  updater: UpdaterPort;
  mode: Exclude<UpdateMode, 'off'>;
  releasesUrl: string;
  // Runs `run` every `ms`; returns how to stop it.
  every(ms: number, run: () => void): () => void;
  onNotice(notice: Notice): void;
  log(message: string): void;
};

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function startUpdates(options: UpdateOptions): { stop(): void } {
  const { updater, mode } = options;
  let busy = false;
  let told: string | undefined;
  let stop = () => {};

  const round = async () => {
    if (busy) return;
    busy = true;
    try {
      const version = await updater.check();
      if (version === undefined || version === told) return;
      if (mode === 'notify') {
        told = version;
        options.onNotice({ kind: 'download', version, url: options.releasesUrl });
        return;
      }
      await updater.download();
      told = version;
      stop();
      options.onNotice({ kind: 'restart', version });
    } catch (error) {
      options.log(`update check failed: ${reason(error)}`);
    } finally {
      busy = false;
    }
  };

  stop = options.every(CHECK_EVERY_MS, () => void round());
  void round();
  return { stop: () => stop() };
}
