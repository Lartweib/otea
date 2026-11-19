import { execFileSync } from 'node:child_process';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { excludeFromGit } from '../app/project.ts';

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

// How many commits `branch` holds over the first of `bases` the repo at cwd has: the branch as it
// is here, or else on origin. Undefined when the repo has neither, or cwd is no repo.
export function commitsOver(
  cwd: string,
  branch: string,
  bases: readonly string[],
): { base: string; count: number } | undefined {
  const tip =
    commitOf(cwd, `refs/heads/${branch}`) ?? commitOf(cwd, `refs/remotes/origin/${branch}`);
  if (!tip) return undefined;
  for (const base of bases) {
    if (base === branch || base === `origin/${branch}`) continue;
    const from = commitOf(cwd, base);
    if (!from) continue;
    try {
      return { base, count: Number(git(cwd, 'rev-list', '--count', `${from}..${tip}`)) };
    } catch {
      return undefined;
    }
  }
  return undefined;
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

// What a push of `to` onto `from` brings in: the branches whose tips are in `to` and not yet in
// `from` (every one in `to` when `from` names no commit, none when `to` names none: a delete),
// local ones and the remote's alike, a remote one by its name on the remote (origin/feat/x is
// feat/x), so a branch reviewed on the remote is known in a fresh clone too. `unpushed` names the
// local branches among them that hold commits their remote never got: what the review saw is what
// was pushed, so those commits were never reviewed. `outside` names the commits of the push no
// given branch holds (local or the remote's), merge commits aside: a merge joins commits, it brings
// none of its own. Throws outside a repo.
export type Brought = {
  branches: string[];
  unpushed: { branch: string; remote: string }[];
  outside?: (held: readonly string[]) => string[];
};

export function branchesBrought(cwd: string, to: string, from?: string): Brought {
  const tip = commitOf(cwd, to);
  if (!tip) return { branches: [], unpushed: [] };
  const base = from === undefined ? undefined : commitOf(cwd, from);
  const args = ['for-each-ref', '--format=%(refname)', `--merged=${tip}`];
  if (base) args.push(`--no-merged=${base}`);
  const refs = git(cwd, ...args, 'refs/heads', 'refs/remotes')
    .split(/\r?\n/)
    .filter(Boolean);
  const remotes = git(cwd, 'remote').split(/\r?\n/).filter(Boolean);
  const local = refs.flatMap((ref) =>
    ref.startsWith('refs/heads/') ? [ref.slice('refs/heads/'.length)] : [],
  );
  const fromRemotes = refs.flatMap((ref) => {
    if (!ref.startsWith('refs/remotes/')) return [];
    const short = ref.slice('refs/remotes/'.length);
    const remote = remotes.find((name) => short.startsWith(`${name}/`));
    const branch = remote === undefined ? undefined : short.slice(remote.length + 1);
    return branch === undefined || branch === 'HEAD' ? [] : [branch];
  });
  const unpushed = local.flatMap((branch) => {
    const remote = remoteName(cwd, branch);
    if (remote === undefined) return [];
    return isAncestor(cwd, `refs/heads/${branch}`, remote) ? [] : [{ branch, remote }];
  });
  const brought: Brought = { branches: [...new Set([...local, ...fromRemotes])], unpushed };
  // With nothing on the remote to start from, the whole history would count as brought in: only a
  // push onto a branch the remote has is asked which commits ride along.
  if (base) brought.outside = (held) => commitsOutside(cwd, tip, base, held, refs, remotes);
  return brought;
}

// The commits in `tip` and not in `base` that none of the `held` branches holds, by short id, merge
// commits aside; `refs` are the refs the push brings in, a branch counting by its local ref and by
// the remote's alike.
function commitsOutside(
  cwd: string,
  tip: string,
  base: string,
  held: readonly string[],
  refs: readonly string[],
  remotes: readonly string[],
): string[] {
  const holding = refs.filter((ref) =>
    held.some(
      (name) =>
        ref === `refs/heads/${name}` ||
        remotes.some((remote) => ref === `refs/remotes/${remote}/${name}`),
    ),
  );
  const listed = git(
    cwd,
    'rev-list',
    '--no-merges',
    '--abbrev-commit',
    tip,
    `^${base}`,
    ...holding.map((ref) => `^${ref}`),
  );
  return listed.split(/\r?\n/).filter(Boolean);
}

// The remote branch a local one is pushed to, by name (origin/feat/x): the remote-tracking branch
// of the same name, on the remote its upstream names or else on origin; only when the remote has
// none of that name, its upstream. git switch -c feat/x origin/main gives feat/x the upstream
// origin/main, yet what the review saw is what was pushed to origin/feat/x (P1-R2-1). Undefined
// when the remote has neither.
function remoteName(cwd: string, branch: string): string | undefined {
  const remotes = [configured(cwd, `branch.${branch}.remote`), 'origin'].filter(
    (remote): remote is string => remote !== undefined && remote !== '.',
  );
  for (const remote of new Set(remotes)) {
    if (commitOf(cwd, `refs/remotes/${remote}/${branch}`)) return `${remote}/${branch}`;
  }
  try {
    return git(cwd, 'rev-parse', '--abbrev-ref', `${branch}@{upstream}`) || undefined;
  } catch {
    return undefined;
  }
}

// A git config value, or undefined when it is not set.
function configured(cwd: string, key: string): string | undefined {
  try {
    return git(cwd, 'config', '--get', key) || undefined;
  } catch {
    return undefined;
  }
}

function isAncestor(cwd: string, ancestor: string, of: string): boolean {
  try {
    git(cwd, 'merge-base', '--is-ancestor', ancestor, of);
    return true;
  } catch {
    return false;
  }
}

// Whether `branch` (here, or else on origin) is in `base` already (here, or on origin, as this
// checkout last saw it): merged, whoever merged it. False when the repo has either of them not,
// or cwd is no repo.
export function mergedInto(cwd: string, branch: string, base: string): boolean {
  const tip =
    commitOf(cwd, `refs/heads/${branch}`) ?? commitOf(cwd, `refs/remotes/origin/${branch}`);
  if (!tip) return false;
  return [`refs/heads/${base}`, `refs/remotes/origin/${base}`].some(
    (ref) => commitOf(cwd, ref) !== undefined && isAncestor(cwd, tip, ref),
  );
}

// What the remote has of a branch, as this checkout last saw it: the remote branch it is pushed
// to (remoteName), or else origin/<branch>.
export function remoteOf(cwd: string, branch: string): string {
  return remoteName(cwd, branch) ?? `origin/${branch}`;
}

// Whether cwd is in a repo's main checkout, not one of its linked worktrees (git worktree add);
// false outside a repo.
export function inMainCheckout(cwd: string): boolean {
  try {
    const dir = resolve(cwd, git(cwd, 'rev-parse', '--git-dir'));
    const common = resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir'));
    return dir === common;
  } catch {
    return false;
  }
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

// How a file Otea writes for this machine alone (it names this machine's path to Otea) stands with
// git: kept out through .git/info/exclude (never .gitignore, a tracked file), already tracked (Otea
// leaves git alone and says so), or outside any repo.
export type KeptOut = 'excluded' | 'tracked' | 'outside';

export function keepOutOfGit(file: string): KeptOut {
  let top: string;
  try {
    top = git(dirname(file), 'rev-parse', '--show-toplevel');
  } catch {
    return 'outside';
  }
  const path = relative(top, file).split(sep).join('/');
  try {
    git(top, 'ls-files', '--error-unmatch', '--', path);
    return 'tracked';
  } catch {}
  excludeFromGit(resolve(top, git(top, 'rev-parse', '--git-common-dir')), `/${path}`);
  return 'excluded';
}

// What a command says after the file it wrote, by how it stands with git.
export function keptOutNote(file: string, kept: KeptOut): string | undefined {
  if (kept === 'excluded') {
    return "kept out of git through .git/info/exclude: it names this machine's path to Otea";
  }
  if (kept === 'tracked') {
    return `${basename(file)} is tracked by git: it now names this machine's path to Otea, so keep that change out of your commits`;
  }
  return undefined;
}
