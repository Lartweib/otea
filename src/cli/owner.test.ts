import { describe, expect, it } from 'vitest';
import {
  ownerChain,
  readPosixTable,
  readProcessTable,
  watchOwner,
  withPosixParents,
} from './owner.ts';
import { until } from './testing.ts';

describe('the processes that own a command', () => {
  // Claude Code on Windows: its Bash tool runs bash, which runs the npm sh shim, which runs node.
  const windows = [
    { pid: 900, parent: 800, name: 'WindowsTerminal.exe' },
    { pid: 800, parent: 900, name: 'pwsh.exe' },
    { pid: 700, parent: 800, name: 'claude.exe' },
    { pid: 600, parent: 700, name: 'bash.exe' },
    { pid: 500, parent: 600, name: 'sh.exe' },
    { pid: 400, parent: 500, name: 'node.exe' },
  ];

  it('climbs the shells above the command up to the harness that runs them', () => {
    expect(ownerChain(windows, 500)).toEqual([500, 600, 700]);
  });

  it('stops at its parent when that is no shell', () => {
    expect(ownerChain(windows, 700)).toEqual([700]);
  });

  it('keeps what it found when a parent is no longer listed', () => {
    const shells = [
      { pid: 500, parent: 600, name: 'sh' },
      { pid: 600, parent: 650, name: '/bin/bash' },
    ];
    expect(ownerChain(shells, 500)).toEqual([500, 600]);
  });

  it('watches only the parent when the process table is not known', () => {
    expect(ownerChain([], 500)).toEqual([500]);
  });

  it('never climbs in a loop', () => {
    const loop = [
      { pid: 500, parent: 600, name: 'sh' },
      { pid: 600, parent: 500, name: 'bash' },
    ];
    expect(ownerChain(loop, 500)).toEqual([500, 600]);
  });

  it('reads the process table as the system lists it', () => {
    expect(readProcessTable('  400   500 node.exe\r\n 500 600 Git Bash.exe\n\nnoise\n')).toEqual([
      { pid: 400, parent: 500, name: 'node.exe' },
      { pid: 500, parent: 600, name: 'Git Bash.exe' },
    ]);
  });

  it('reads where each program lives when the listing says it', () => {
    expect(
      readProcessTable(
        '500 600 sh.exe\tC:\\Program Files\\Git\\usr\\bin\\sh.exe\r\n4 0 System\t\r\n',
      ),
    ).toEqual([
      { pid: 500, parent: 600, name: 'sh.exe', path: 'C:\\Program Files\\Git\\usr\\bin\\sh.exe' },
      { pid: 4, parent: 0, name: 'System' },
    ]);
  });

  describe('Git Bash on Windows', () => {
    // What Claude Code's background Bash leaves: claude.exe runs Git's bash.exe, which runs the
    // MSYS bash. That bash forks a copy (310) to run the npm shim; the copy becomes sh (320) and
    // ends at once, so Windows names a parent no longer running. sh then runs node (400), and
    // stays as its stub (500), the parent Windows gives node. Only the MSYS table links them.
    const windows = [
      { pid: 700, parent: 650, name: 'claude.exe' },
      { pid: 600, parent: 700, name: 'bash.exe' },
      { pid: 300, parent: 600, name: 'bash.exe' },
      { pid: 500, parent: 310, name: 'sh.exe' },
      { pid: 400, parent: 500, name: 'node.exe' },
    ];
    const msys = [
      '      PID    PPID    PGID     WINPID   TTY         UID    STIME COMMAND',
      '     1003       1    1003        300  ?         197609 21:29:38 /usr/bin/bash',
      '     1006    1003    1003        400  ?         197609 21:29:39 /c/Program Files/nodejs/node',
      '     1009       1    1009        999  ?         197609 21:29:43 /usr/bin/ps',
    ].join('\r\n');

    it('reads the MSYS process table', () => {
      expect(readPosixTable(msys)).toEqual([
        { pid: 1003, parent: 1, winpid: 300 },
        { pid: 1006, parent: 1003, winpid: 400 },
        { pid: 1009, parent: 1, winpid: 999 },
      ]);
    });

    it('climbs from the shim past the shell copy that already ended, up to the harness', () => {
      const rows = withPosixParents(windows, readPosixTable(msys));
      expect(ownerChain(rows, 500)).toEqual([500, 300, 600, 700]);
    });

    it('counts a harness that ended before the listing as gone, once the parents are real', () => {
      const ended = withPosixParents(
        windows.filter(({ pid }) => pid !== 700),
        readPosixTable(msys),
      );
      expect(ownerChain(ended, 500, true)).toEqual([500, 300, 600, 700]);
      // Without MSYS's table a missing parent may be the fork that ended: it proves nothing.
      expect(ownerChain(windows, 500)).toEqual([500]);
    });

    it('keeps the Windows parents when there is no MSYS table', () => {
      expect(withPosixParents(windows, [])).toEqual(windows);
      expect(ownerChain(windows, 500)).toEqual([500]);
    });
  });

  describe('watchOwner', () => {
    const harness = 424242;
    // This process's parent is a shell started by `harness`, as Claude Code's bash is.
    const listed = async () => ({
      rows: [
        { pid: process.ppid, parent: harness, name: 'bash.exe' },
        { pid: harness, parent: 1, name: 'claude.exe' },
      ],
      complete: true,
    });

    it('stops once the harness above the shells ended, though the shell still runs', async () => {
      let harnessRuns = true;
      const alive = (pid: number) => pid !== harness || harnessRuns;
      const owner = watchOwner(new AbortController().signal, { list: listed, alive, everyMs: 10 });
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(owner.signal.aborted).toBe(false);

        harnessRuns = false;
        await until(() => owner.signal.aborted);
        expect(owner.orphaned()).toBe(true);
      } finally {
        owner.stop();
      }
    });

    it('lists nothing once the parent is already gone', async () => {
      let listings = 0;
      const list = async () => {
        listings += 1;
        return { rows: [], complete: true };
      };
      const owner = watchOwner(new AbortController().signal, {
        list,
        alive: (pid) => pid !== process.ppid,
        everyMs: 10,
      });
      try {
        await until(() => owner.signal.aborted);
        expect(owner.orphaned()).toBe(true);
        expect(listings).toBe(0);
      } finally {
        owner.stop();
      }
    });

    it('stops with the command interrupted, not orphaned', () => {
      const interrupt = new AbortController();
      const owner = watchOwner(interrupt.signal, { list: listed, everyMs: 10 });
      interrupt.abort();
      owner.stop();

      expect(owner.signal.aborted).toBe(true);
      expect(owner.orphaned()).toBe(false);
    });
  });
});
