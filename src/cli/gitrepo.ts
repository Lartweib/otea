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

// The name a repo task's `repo` field gives the repo at cwd. Until the project registers its repos
// by name, it is the repo's folder name: the folder above its common git dir, so a worktree of it
// answers with the repo's name, not its own folder's. A registered name will be looked up here.
export function repoName(cwd: string): string {
  return basename(dirname(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir'))));
}
