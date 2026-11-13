import { describe, expect, it, vi } from 'vitest';
import {
  CHECK_EVERY_MS,
  type Notice,
  startUpdates,
  type UpdaterPort,
  updateMode,
} from './updates.ts';

const RELEASES = 'https://github.com/Lartweib/otea/releases/latest';

// A fake electron-updater and a fake clock: `tick` runs what the interval would run.
function rig(versions: (string | undefined | Error)[], mode: 'install' | 'notify' = 'install') {
  const notices: Notice[] = [];
  const logged: string[] = [];
  let tick: (() => void) | undefined;
  let stopped = false;
  const updater: UpdaterPort = {
    check: vi.fn(async () => {
      const next = versions.shift();
      if (next instanceof Error) throw next;
      return next;
    }),
    download: vi.fn(async () => {}),
  };
  const flow = startUpdates({
    updater,
    mode,
    releasesUrl: RELEASES,
    every: (ms, run) => {
      expect(ms).toBe(CHECK_EVERY_MS);
      tick = run;
      return () => {
        stopped = true;
      };
    },
    onNotice: (notice) => notices.push(notice),
    log: (message) => logged.push(message),
  });
  const settle = () => new Promise((done) => setTimeout(done, 0));
  return {
    updater,
    notices,
    logged,
    flow,
    settle,
    tick: async () => {
      tick?.();
      await settle();
    },
    stopped: () => stopped,
  };
}

describe('updateMode', () => {
  it('leaves a development run alone', () => {
    expect(updateMode({ packaged: false, platform: 'win32', macSigned: false })).toBe('off');
  });

  it('installs on Windows and Linux', () => {
    expect(updateMode({ packaged: true, platform: 'win32', macSigned: false })).toBe('install');
    expect(updateMode({ packaged: true, platform: 'linux', macSigned: false })).toBe('install');
  });

  // macOS only applies an update to a signed app: until then it says where to download it.
  it('only notifies on an unsigned Mac', () => {
    expect(updateMode({ packaged: true, platform: 'darwin', macSigned: false })).toBe('notify');
    expect(updateMode({ packaged: true, platform: 'darwin', macSigned: true })).toBe('install');
  });
});

describe('startUpdates', () => {
  it('checks at start and again every few hours', async () => {
    const run = rig([undefined, undefined]);
    await run.settle();
    expect(run.updater.check).toHaveBeenCalledTimes(1);
    await run.tick();
    expect(run.updater.check).toHaveBeenCalledTimes(2);
    expect(run.notices).toEqual([]);
    expect(CHECK_EVERY_MS).toBe(4 * 60 * 60 * 1000);
  });

  it('downloads in the background and only then says a restart applies it', async () => {
    const run = rig(['0.2.0']);
    await run.settle();
    expect(run.updater.download).toHaveBeenCalledTimes(1);
    expect(run.notices).toEqual([{ kind: 'restart', version: '0.2.0' }]);
    // Nothing more to fetch until the restart.
    expect(run.stopped()).toBe(true);
  });

  it('keeps quiet when a check or a download fails, and tries again later', async () => {
    const run = rig([new Error('offline'), '0.2.0']);
    await run.settle();
    expect(run.notices).toEqual([]);
    expect(run.logged).toEqual(['update check failed: offline']);
    await run.tick();
    expect(run.notices).toEqual([{ kind: 'restart', version: '0.2.0' }]);
  });

  it('never runs two checks at once', async () => {
    const run = rig(['0.2.0']);
    let finish: () => void = () => {};
    vi.mocked(run.updater.download).mockImplementation(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    await run.settle();
    await run.tick();
    expect(run.updater.check).toHaveBeenCalledTimes(1);
    finish();
    await run.settle();
    expect(run.notices).toHaveLength(1);
  });

  it('on an unsigned Mac points at the download once per version', async () => {
    const run = rig(['0.2.0', '0.2.0', '0.3.0'], 'notify');
    await run.settle();
    await run.tick();
    await run.tick();
    expect(run.updater.download).not.toHaveBeenCalled();
    expect(run.notices).toEqual([
      { kind: 'download', version: '0.2.0', url: RELEASES },
      { kind: 'download', version: '0.3.0', url: RELEASES },
    ]);
    expect(run.stopped()).toBe(false);
  });

  it('stops checking when stopped', async () => {
    const run = rig([undefined]);
    await run.settle();
    run.flow.stop();
    expect(run.stopped()).toBe(true);
  });
});
