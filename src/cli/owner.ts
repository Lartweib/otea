import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { ownerGone, processAlive } from '../app/presence.ts';

export type ProcessRow = { pid: number; parent: number; name: string; path?: string };

// The programs that only run a command for someone else: a harness runs `otea` through them (its
// shell, npm's sh or cmd shim), and on Windows they outlive the harness that started them.
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh', 'fish', 'cmd', 'powershell', 'pwsh']);

const isShell = (name: string) =>
  SHELLS.has(
    basename(name.replaceAll('\\', '/'))
      .toLowerCase()
      .replace(/\.exe$/, ''),
  );

// The processes a command started by `parent` belongs to: the parent, and while it is a shell the
// one that started it, up to the first that is none (the harness). Claude Code on Windows runs a
// command through bash and npm's sh shim; ending its session leaves both running, so watching the
// parent alone would never see the session end.
export function ownerChain(rows: readonly ProcessRow[], parent: number): number[] {
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const chain = [parent];
  let row = byPid.get(parent);
  while (row && isShell(row.name)) {
    const next = byPid.get(row.parent);
    if (!next || chain.includes(next.pid)) break;
    chain.push(next.pid);
    row = next;
  }
  return chain;
}

// Lines of "pid parent name", as both listings below print them; on Windows a tab and the program's
// file follow, when Windows says it.
export function readProcessTable(text: string): ProcessRow[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+([^\t]+?)\s*(?:\t(.*?)\s*)?$/.exec(line);
    if (!match) return [];
    const [, pid, parent, name, path] = match;
    const row: ProcessRow = { pid: Number(pid), parent: Number(parent), name: name as string };
    return [path ? { ...row, path } : row];
  });
}

// A process as Git Bash's MSYS lists it (its ps): its MSYS id, its MSYS parent's, and its Windows id.
export type PosixRow = { pid: number; parent: number; winpid: number };

export function readPosixTable(text: string): PosixRow[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+\d+\s+(\d+)\s/.exec(line);
    if (!match) return [];
    const [, pid, parent, winpid] = match;
    return [{ pid: Number(pid), parent: Number(parent), winpid: Number(winpid) }];
  });
}

// The Windows rows with each parent as MSYS knows it. Git Bash runs a command in a fork of itself
// that becomes the command and ends, so Windows names as parent a process long gone, while MSYS
// still links the command to the bash that forked it. A program that is no MSYS one (node) runs
// from MSYS with the shell left as its stub: Windows lists the stub as its parent, MSYS lists the
// program under the stub's id, so the stub's parent is the program's MSYS parent.
export function withPosixParents(
  rows: readonly ProcessRow[],
  posix: readonly PosixRow[],
): ProcessRow[] {
  const byPid = new Map(posix.map((row) => [row.pid, row]));
  const listed = new Set(posix.map((row) => row.winpid));
  const parents = new Map<number, number>();
  for (const row of posix) {
    const parent = row.parent > 1 ? byPid.get(row.parent) : undefined;
    if (parent) parents.set(row.winpid, parent.winpid);
  }
  for (const row of rows) {
    const parent = parents.get(row.pid);
    if (parent !== undefined && !listed.has(row.parent) && !parents.has(row.parent)) {
      parents.set(row.parent, parent);
    }
  }
  return rows.map((row) => {
    const parent = parents.get(row.pid);
    return parent === undefined || parent === row.parent ? row : { ...row, parent };
  });
}

const WINDOWS_LISTING =
  'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,ExecutablePath | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.Name)`t$($_.ExecutablePath)" }';

// The busy Windows runner answered WMI after 20 s; the owner check waits for it in the background.
const LISTING_TIMEOUT_MS = 60_000;

function run(
  command: string,
  args: readonly string[],
  signal: AbortSignal,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      command,
      args as string[],
      // From the temp folder: on Windows a process holds the folder it runs in, and the listing
      // may outlive this command for a moment; it must never keep the project's folder busy.
      { cwd: tmpdir(), encoding: 'utf8', timeout: LISTING_TIMEOUT_MS, windowsHide: true, signal },
      (error, stdout) => resolve(error ? undefined : stdout),
    );
  });
}

// The ps of the MSYS that runs `start` (Git Bash's usr/bin, next to its sh.exe), if it is one.
function posixLister(rows: readonly ProcessRow[], start: number): string | undefined {
  const path = rows.find((row) => row.pid === start)?.path;
  if (!path || !isShell(path)) return undefined;
  const ps = join(dirname(path), 'ps.exe');
  return existsSync(ps) ? ps : undefined;
}

// Every process on this computer with its parent, or undefined when the system does not say. On
// Windows, a command `start` runs through Git Bash gets its parents from MSYS (withPosixParents).
export async function listProcesses(
  signal: AbortSignal,
  start: number = process.ppid,
): Promise<ProcessRow[] | undefined> {
  if (process.platform !== 'win32') {
    const out = await run('ps', ['-A', '-o', 'pid=,ppid=,comm='], signal);
    return out === undefined ? undefined : readProcessTable(out);
  }
  const out = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_LISTING],
    signal,
  );
  if (out === undefined) return undefined;
  const rows = readProcessTable(out);
  const ps = posixLister(rows, start);
  const posix = ps === undefined ? undefined : await run(ps, [], signal);
  return posix === undefined ? rows : withPosixParents(rows, readPosixTable(posix));
}

// How often a long-running command checks that the processes that started it still run.
const OWNER_CHECK_MS = 5_000;

export type OwnerWatch = { signal: AbortSignal; orphaned: () => boolean; stop: () => void };

// Aborts `signal` once the session that started this process is gone (ownerGone), on `parent` (the
// command's interrupt): left running, a wait would keep its agent shown as listening until its
// timeout, and a server would keep serving no one. The shells above it are read on the first
// check, so a command that ends at once never lists the processes.
export function watchOwner(
  parent: AbortSignal,
  {
    list = listProcesses,
    alive = processAlive,
    everyMs = OWNER_CHECK_MS,
  }: {
    list?: (signal: AbortSignal) => Promise<ProcessRow[] | undefined>;
    alive?: (pid: number) => boolean;
    everyMs?: number;
  } = {},
): OwnerWatch {
  const start = process.ppid;
  const controller = new AbortController();
  const listing = new AbortController();
  let chain = [start];
  let listed = false;
  let orphaned = false;
  const onAbort = () => controller.abort();
  parent.addEventListener('abort', onAbort, { once: true });
  const timer = setInterval(() => {
    if (ownerGone(start, process.ppid, alive, chain)) {
      orphaned = true;
      controller.abort();
      return;
    }
    if (listed) return;
    listed = true;
    void list(listing.signal).then((rows) => {
      if (rows) chain = ownerChain(rows, start);
    });
  }, everyMs);
  timer.unref();
  const stop = () => {
    clearInterval(timer);
    listing.abort();
    parent.removeEventListener('abort', onAbort);
  };
  // Once stopped for any reason it lists nothing more, so a listing never keeps the process alive.
  controller.signal.addEventListener('abort', stop, { once: true });
  return { signal: controller.signal, orphaned: () => orphaned, stop };
}
