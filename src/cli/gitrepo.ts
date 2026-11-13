import { execFileSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';

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

// The name a repo task's `repo` field gives the repo at cwd. Until the project registers its repos
// by name, it is the repo's folder name: the folder above its common git dir, so a worktree of it
// answers with the repo's name, not its own folder's. A registered name will be looked up here.
export function repoName(cwd: string): string {
  return basename(dirname(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir'))));
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
