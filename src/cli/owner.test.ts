import { describe, expect, it } from 'vitest';
import { ownerChain, readProcessTable, watchOwner } from './owner.ts';
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

  describe('watchOwner', () => {
    const harness = 424242;
    // This process's parent is a shell started by `harness`, as Claude Code's bash is.
    const listed = async () => [
      { pid: process.ppid, parent: harness, name: 'bash.exe' },
      { pid: harness, parent: 1, name: 'claude.exe' },
    ];

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
        return [];
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
