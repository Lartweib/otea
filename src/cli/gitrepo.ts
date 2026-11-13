import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

// The branch checked out in the repo at cwd, even before its first commit; throws outside a repo
// or on a detached HEAD.
export function currentBranch(cwd: string): string {
  try {
    return git(cwd, 'symbolic-ref', '--short', 'HEAD');
  } catch {
    throw new Error('no branch checked out here; name it with --branch <name>');
  }
}

// The local branches of the repo at cwd; throws outside a repo.
export function localBranches(cwd: string): string[] {
  const listed = git(cwd, 'for-each-ref', '--format=%(refname:short)', 'refs/heads');
  return listed.split('\n').filter(Boolean);
}

// The commit a ref names in the repo at cwd, or undefined when it names none (a ref the repo does
// not have, or the all-zero id git gives a branch that is created or deleted).
function commitOf(cwd: string, ref: string): string | undefined {
  if (ref === '' || /^0+$/.test(ref)) return undefined;
  try {
    return git(cwd, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`) || undefined;
  } catch {
    return undefined;
  }
}

// The local branches whose tips a push of `to` onto `from` brings in: in `to` and not yet in
// `from`; every one in `to` when `from` names no commit, none when `to` names none (a delete).
// Throws outside a repo.
export function branchesBrought(cwd: string, to: string, from?: string): string[] {
  const tip = commitOf(cwd, to);
  if (!tip) return [];
  const base = from === undefined ? undefined : commitOf(cwd, from);
  const args = ['for-each-ref', '--format=%(refname:short)', `--merged=${tip}`];
  if (base) args.push(`--no-merged=${base}`);
  return git(cwd, ...args, 'refs/heads')
    .split('\n')
    .filter(Boolean);
}

// What the remote has of a branch, as this checkout last saw it: its upstream, or else
// origin/<branch>.
export function remoteOf(cwd: string, branch: string): string {
  return commitOf(cwd, `${branch}@{upstream}`) ? `${branch}@{upstream}` : `origin/${branch}`;
}

// The top folder of the repo at cwd, or cwd itself outside a repo.
export function repoRoot(cwd: string): string {
  try {
    return git(cwd, 'rev-parse', '--show-toplevel');
  } catch {
    return resolve(cwd);
  }
}

// Where the repo at cwd keeps a path of its git dir, following its config (core.hooksPath for
// hooks/); throws outside a repo.
export function gitPath(cwd: string, path: string): string {
  return resolve(cwd, git(cwd, 'rev-parse', '--git-path', path));
}
