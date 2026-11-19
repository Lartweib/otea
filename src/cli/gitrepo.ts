import { execFileSync } from 'node:child_process';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import type { Landing, MergeTake, Tip } from '../app/gates.ts';
import { excludeFromGit } from '../app/project.ts';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

// A commit object git writes only to chain merges in memory of the repo (never a ref): it needs an
// identity, which a fresh clone or a CI runner may not have.
const SCRATCH_IDENTITY = {
  GIT_AUTHOR_NAME: 'otea',
  GIT_AUTHOR_EMAIL: 'otea@localhost',
  GIT_COMMITTER_NAME: 'otea',
  GIT_COMMITTER_EMAIL: 'otea@localhost',
};

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
  landsAs?: (landing: readonly Landing[], onto?: string) => boolean;
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
  brought.landsAs = (landing, onto) => {
    const start =
      onto === undefined ? base : (commitOf(cwd, remoteOf(cwd, onto)) ?? commitOf(cwd, onto));
    return landsAs(cwd, tip, start, landing);
  };
  return brought;
}

// Whether `tip` holds exactly what was approved of the branches it lands, merged onto `start` (the
// base as the remote has it): each branch at the commit the person approved (`tip`), or, when none
// was recorded, as it stands here. The approved commit itself always passes; so does any other
// commit with the same tree as that merge (a rebase, or a merge commit with nothing of its own). A
// merge with conflicts is never what was approved: its resolution was never reviewed.
function landsAs(
  cwd: string,
  tip: string,
  start: string | undefined,
  landing: readonly Landing[],
): boolean {
  const [only] = landing;
  if (landing.length === 1 && only?.tip?.commit === tip) return true;
  const commits: string[] = [];
  for (const { branch, tip: approved } of landing) {
    const commit = approved
      ? commitOf(cwd, approved.commit)
      : (commitOf(cwd, `refs/heads/${branch}`) ?? commitOf(cwd, remoteOf(cwd, branch)));
    // An approved commit this checkout never got can only be matched by its tree.
    if (!commit)
      return landing.length === 1 && approved !== undefined && treeOf(cwd, tip) === approved.tree;
    commits.push(commit);
  }
  let at = start;
  let tree = start === undefined ? undefined : treeOf(cwd, start);
  for (const commit of commits) {
    if (at === undefined) {
      at = commit;
      tree = treeOf(cwd, commit);
      continue;
    }
    try {
      tree = git(cwd, 'merge-tree', '--write-tree', at, commit).split(/\r?\n/)[0];
    } catch {
      return false;
    }
    if (commit === commits.at(-1)) break;
    at = execFileSync('git', ['commit-tree', String(tree), '-p', at, '-p', commit, '-m', 'otea'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, ...SCRATCH_IDENTITY },
    }).trim();
  }
  return tree !== undefined && tree === treeOf(cwd, tip);
}

// Runs git, giving back its output, or when it failed the first error line it wrote to stderr.
function tried(cwd: string, ...args: string[]): { out: string } | { error: string } {
  try {
    return {
      out: execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (error) {
    const lines = String((error as { stderr?: unknown }).stderr ?? '')
      .split(/\r?\n/)
      .map((text) => text.trim())
      .filter(Boolean);
    const line = lines.find((text) => /^(fatal|error): /.test(text)) ?? lines[0] ?? '';
    return { error: line.replace(/^(fatal|error): /, '') || `git ${args[0]} failed` };
  }
}

// What a merge of the approved branch takes, as its remote has it right now (P3C-R3-1): a forge
// merges the branch there, which a clone without Otea's hook may have pushed to since the person
// approved it. The branch and the base it merges into are fetched from the remote the branch is
// pushed to; a repo with no such remote, or a remote with no branch of that name, merges the branch
// as this checkout has it. `given` is a commit the merge names (--commits), checked as well. Held
// when each is the approved commit, or a rebase of it onto the base with the same result; never
// throws: what git cannot tell is `unknown`, for the gate to refuse.
export function mergeTake(cwd: string, tip: Tip, base?: string, given?: string): MergeTake {
  try {
    const { branch } = tip;
    const remote = pushRemote(cwd, branch);
    const remotes = git(cwd, 'remote').split(/\r?\n/).filter(Boolean);
    const takes: { ref: string; at: string }[] = [];
    let start: string | undefined;
    if (remotes.includes(remote)) {
      const heads = [branch, ...(base ? [base] : [])].map((name) => `refs/heads/${name}`);
      const listed = tried(cwd, 'ls-remote', '--heads', remote, ...heads);
      if ('error' in listed) return { unknown: `git could not reach ${remote} (${listed.error})` };
      const there = new Map(
        listed.out
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => {
            const [commit = '', ref = ''] = line.split('\t');
            return [ref.slice('refs/heads/'.length), commit] as const;
          }),
      );
      const fetch = [...there.keys()]
        .filter((name) => commitOf(cwd, there.get(name) ?? '') === undefined)
        .map((name) => `+refs/heads/${name}:refs/remotes/${remote}/${name}`);
      if (fetch.length > 0) {
        const fetched = tried(cwd, 'fetch', '--quiet', '--no-tags', remote, ...fetch);
        if ('error' in fetched)
          return { unknown: `git could not fetch it from ${remote} (${fetched.error})` };
      }
      const at = there.get(branch);
      const here = commitOf(cwd, `refs/heads/${branch}`);
      if (at) takes.push({ ref: `${remote}/${branch}`, at });
      else if (here) takes.push({ ref: branch, at: here });
      else return { unknown: `${remote} has no branch ${branch}, and neither has this checkout` };
      const onto = base ? there.get(base) : undefined;
      start = onto ?? (base ? commitOf(cwd, remoteOf(cwd, base)) : undefined);
    } else {
      const ref = remoteName(cwd, branch) ?? branch;
      const at = commitOf(cwd, ref);
      if (!at) return { unknown: `this checkout has no branch ${branch}` };
      takes.push({ ref, at });
      start = base ? (commitOf(cwd, remoteOf(cwd, base)) ?? commitOf(cwd, base)) : undefined;
    }
    if (given !== undefined) {
      const at = commitOf(cwd, given);
      if (!at) return { unknown: `${given} is not in this repository; fetch first` };
      takes.push({ ref: given, at });
    }
    for (const { ref, at } of takes) {
      if (landsAs(cwd, at, start, [{ branch, tip }])) continue;
      return { held: false, ref, commit: at.slice(0, 7), added: addedSince(cwd, tip, at, start) };
    }
    return { held: true };
  } catch (error) {
    return { unknown: error instanceof Error ? error.message : String(error) };
  }
}

// The commits `at` holds that the approved tip and the base do not, a rebased copy of an approved
// one aside, each by short id with its author, oldest first; none when this checkout lacks the
// approved commit.
function addedSince(
  cwd: string,
  tip: Tip,
  at: string,
  start: string | undefined,
): { commit: string; author: string }[] {
  const approved = commitOf(cwd, tip.commit);
  if (!approved) return [];
  const listed = tried(
    cwd,
    'log',
    '--no-merges',
    '--cherry-pick',
    '--right-only',
    '--reverse',
    '--format=%h%x09%an',
    '--abbrev=7',
    `${approved}...${at}`,
    ...(start ? [`^${start}`] : []),
  );
  if ('error' in listed) return [];
  return listed.out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [commit = '', author = ''] = line.split('\t');
      return { commit, author };
    });
}

function treeOf(cwd: string, commit: string): string | undefined {
  try {
    return git(cwd, 'rev-parse', '--verify', '--quiet', `${commit}^{tree}`) || undefined;
  } catch {
    return undefined;
  }
}

// What an agent hands a branch off at: its commit and tree, for the gate to hold the landing to
// what the person approved. The remote's branch when it has one (the review reads what was
// pushed), else the local one; `local` first for a branch never pushed before its approval (the
// base itself, on a board that works straight on it). Undefined when this checkout has neither.
export function tipOf(cwd: string, branch: string, local = false): Tip | undefined {
  const here = commitOf(cwd, `refs/heads/${branch}`);
  const remote = remoteName(cwd, branch);
  const there = remote === undefined ? undefined : commitOf(cwd, remote);
  const commit = local ? (here ?? there) : (there ?? here);
  const tree = commit === undefined ? undefined : treeOf(cwd, commit);
  return commit === undefined || tree === undefined ? undefined : { branch, commit, tree };
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
  const same = sameNameRemote(cwd, branch);
  if (same) return same;
  try {
    return git(cwd, 'rev-parse', '--abbrev-ref', `${branch}@{upstream}`) || undefined;
  } catch {
    return undefined;
  }
}

// The remote the branch is pushed to: the one its upstream names, else origin.
function pushRemote(cwd: string, branch: string): string {
  const named = configured(cwd, `branch.${branch}.remote`);
  return named === undefined || named === '.' ? 'origin' : named;
}

// The remote-tracking branch of the same name, on the remote its upstream names or else on origin.
function sameNameRemote(cwd: string, branch: string): string | undefined {
  for (const remote of new Set([pushRemote(cwd, branch), 'origin'])) {
    if (commitOf(cwd, `refs/remotes/${remote}/${branch}`)) return `${remote}/${branch}`;
  }
  return undefined;
}

// How a branch stands with its remote in the repo at cwd, for a handoff to check before the branch
// freezes in review: `ahead` when the remote branch of its name lacks commits of the local one,
// `unpushed` when the remote has no branch of its name though the repo has a remote, `missing`
// when the checkout has the branch neither here nor on the remote (`on` names the branch checked
// out). Undefined outside a repo.
export type PushState =
  | { kind: 'pushed' | 'local' }
  | { kind: 'ahead'; remote: string; push: string }
  | { kind: 'unpushed'; push: string }
  | { kind: 'missing'; on?: string };

export function pushState(cwd: string, branch: string): PushState | undefined {
  try {
    git(cwd, 'rev-parse', '--git-dir');
  } catch {
    return undefined;
  }
  const here = commitOf(cwd, `refs/heads/${branch}`);
  const remote = sameNameRemote(cwd, branch);
  const push = pushRemote(cwd, branch);
  if (!here) {
    if (remote) return { kind: 'pushed' };
    let on: string | undefined;
    try {
      on = git(cwd, 'symbolic-ref', '--short', 'HEAD') || undefined;
    } catch {}
    return on === undefined ? { kind: 'missing' } : { kind: 'missing', on };
  }
  if (remote) {
    return isAncestor(cwd, here, remote) ? { kind: 'pushed' } : { kind: 'ahead', remote, push };
  }
  const remotes = git(cwd, 'remote').split(/\r?\n/).filter(Boolean);
  return remotes.length === 0 ? { kind: 'local' } : { kind: 'unpushed', push };
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

// The top folder of the checkout at cwd (a linked worktree's own, not the main checkout's), or
// undefined outside a repo.
export function checkoutRoot(cwd: string): string | undefined {
  try {
    return resolve(git(cwd, 'rev-parse', '--show-toplevel'));
  } catch {
    return undefined;
  }
}

// The top folder of the repo at cwd, or cwd itself outside a repo.
export function repoRoot(cwd: string): string {
  return checkoutRoot(cwd) ?? resolve(cwd);
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
