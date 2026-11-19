import { execFile } from 'node:child_process';
import { getItem } from '../app/items.ts';
import { liveBoardOf } from '../app/next.ts';
import type { Project } from '../app/project.ts';
import { approvedTipOf } from '../app/tips.ts';
import { commitsAddedSince } from '../cli/gitrepo.ts';
import { isClosed, positionOf } from '../core/board/engine.ts';
import { guardedBranch } from '../core/board/model.ts';

// What moved on the remote branch of an item in review since its handoff (P3C-R3-1): a clone
// without Otea's hook can push to it while the person reads what was handed off, and the desk says
// so before they approve. `handed` is the commit handed off, `now` the one the remote has, `added`
// the commits on it that were not handed off, each with its author.
export type Drift = {
  branch: string;
  handed: string;
  now: string;
  added: { commit: string; author: string }[];
};

// Git runs off the request's thread: asking the remote can take seconds.
function git(cwd: string, ...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, encoding: 'utf8', timeout: 20_000, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout).trim())),
    );
  });
}

async function has(cwd: string, ref: string): Promise<boolean> {
  try {
    await git(cwd, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

// The remote the branch is pushed to: the one its upstream names, else origin.
async function remoteOf(cwd: string, branch: string): Promise<string> {
  try {
    const named = await git(cwd, 'config', '--get', `branch.${branch}.remote`);
    return named === '' || named === '.' ? 'origin' : named;
  } catch {
    return 'origin';
  }
}

// One answer per branch and handed-off commit for a few seconds: the page asks again on each look.
const FRESH_MS = 20_000;
const asked = new Map<string, { at: number; drift: Promise<Drift | null> }>();

// The drift of an item's protected branch while it waits for the person's review; null when it
// is not in review, its handoff recorded no tip, the remote still has that tip, or git cannot
// tell (no remote, offline): the desk then says nothing rather than guess.
export async function branchDrift(project: Project, id: string): Promise<Drift | null> {
  const item = getItem(project, id);
  const board = liveBoardOf(project, item.collection);
  const guard = board ? guardedBranch(board.def) : undefined;
  const position = positionOf(item.state);
  if (!guard || isClosed(position) || position.phase === 'doing') return null;
  const branch = String(item.fields[guard.id] ?? '').trim();
  if (branch === '' || branch === guard.guard.base) return null;
  const tip = approvedTipOf(project, item.id, branch);
  if (!tip || tip.unchanged) return null;
  const key = [project.root, branch, tip.commit].join('\0');
  const now = Date.now();
  const known = asked.get(key);
  if (known && now - known.at < FRESH_MS) return known.drift;
  const base = guard.guard.base;
  const drift = (async (): Promise<Drift | null> => {
    const cwd = project.root;
    try {
      const remote = await remoteOf(cwd, branch);
      const remotes = (await git(cwd, 'remote')).split(/\r?\n/).filter(Boolean);
      if (!remotes.includes(remote)) return null;
      const listed = await git(cwd, 'ls-remote', '--heads', remote, `refs/heads/${branch}`);
      const at = listed.split(/\s+/)[0] ?? '';
      if (at === '' || at === tip.commit) return null;
      if (!(await has(cwd, at))) {
        await git(
          cwd,
          'fetch',
          '--quiet',
          '--no-tags',
          remote,
          `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`,
        );
      }
      const onto = base && (await has(cwd, `refs/remotes/${remote}/${base}`));
      const start = onto ? `refs/remotes/${remote}/${base}` : undefined;
      return {
        branch,
        handed: tip.commit.slice(0, 7),
        now: at.slice(0, 7),
        added: commitsAddedSince(cwd, tip, at, start),
      };
    } catch {
      return null;
    }
  })();
  asked.set(key, { at: now, drift });
  return drift;
}
