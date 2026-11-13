import { execFileSync } from 'node:child_process';

// What otea check reads from a Claude Code PreToolUse event: where the call runs and, for Bash, the
// command it runs.
export type HookEvent = { cwd?: string; command?: string };

export function readHookEvent(text: string): HookEvent {
  const event: unknown = JSON.parse(text);
  if (event === null || typeof event !== 'object')
    throw new Error('the hook event is not an object');
  const { cwd, tool_input: toolInput } = event as { cwd?: unknown; tool_input?: unknown };
  const command = (toolInput as { command?: unknown } | null | undefined)?.command;
  const read: HookEvent = {};
  if (typeof cwd === 'string' && cwd !== '') read.cwd = cwd;
  if (typeof command === 'string') read.command = command;
  return read;
}

// The words of a shell command, quotes taken off; good enough to read the arguments of one call.
function words(command: string): string[] {
  return [...command.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g)].map(
    ([, double, single, bare]) => double ?? single ?? bare ?? '',
  );
}

// The options of gh pr merge that take a value, so their value is not read as the PR.
const VALUE_FLAGS = new Set([
  '-b',
  '--body',
  '-F',
  '--body-file',
  '-t',
  '--subject',
  '-A',
  '--author-email',
  '--match-head-commit',
  '-R',
  '--repo',
]);

// The PR a `gh pr merge` in the command names (a number, a URL or a branch), or nothing when it
// names none, or the command merges nothing.
export function mergeTarget(command: string): string | undefined {
  const call = /\bgh\s+pr\s+merge\b([^;&|\n]*)/.exec(command);
  if (!call) return undefined;
  const args = words(call[1] ?? '');
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? '';
    if (VALUE_FLAGS.has(arg)) index++;
    else if (!arg.startsWith('-')) return arg;
  }
  return undefined;
}

// Where the git pushes of a command write: the branches they name, the current branch (`current`,
// when a push names none, or names HEAD) and every local branch (`every`, for --all). `from` holds
// what a named branch is sent from when it is not the branch of that name: the ref of `src:dst`
// (HEAD included), or '' for a delete.
export type PushTargets = {
  branches: string[];
  current: boolean;
  every: boolean;
  from: Record<string, string>;
};

const CURRENT = Symbol('current');

// The options of git push that take a value, so their value is not read as the remote or a refspec.
const PUSH_VALUE_FLAGS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);

// The options of git push that write to branches no refspec names.
const PUSH_UNTOLD = new Set(['--mirror', '--prune']);

// The branch a refspec writes to: its destination, or its source when it names none; `current`
// for HEAD, undefined for a ref that is not a branch (a tag). Throws when it cannot tell.
function refspecBranch(refspec: string): string | typeof CURRENT | undefined {
  const spec = refspec.replace(/^\+/, '');
  const colon = spec.indexOf(':');
  const target = colon < 0 ? spec : spec.slice(colon + 1) || spec.slice(0, colon);
  if (/[*$`]/.test(spec)) throw new Error(`"${refspec}" is not a plain refspec`);
  if (colon < 0 && (target === 'HEAD' || target === '@')) return CURRENT;
  if (target.startsWith('refs/heads/')) return target.slice('refs/heads/'.length);
  if (target.startsWith('refs/')) return undefined;
  if (target === 'HEAD' || target === '@') throw new Error(`"${refspec}" names no branch`);
  return target;
}

// What a refspec sends: its source when it names one apart from its destination ('' for `:dst`),
// undefined for a refspec that sends the branch of its own name.
function refspecSource(refspec: string): string | undefined {
  const spec = refspec.replace(/^\+/, '');
  const colon = spec.indexOf(':');
  return colon < 0 ? undefined : spec.slice(0, colon);
}

// Where the `git push` calls of a command write, nothing when it has none, or `unknown` with why it
// cannot tell, for a push that may write to branches it does not name.
export function pushTargets(command: string): PushTargets | { unknown: string } | undefined {
  const calls = [...command.matchAll(/\bgit\s+push(?=\s|$)([^;&|\n]*)/g)];
  if (calls.length === 0) return undefined;
  const targets: PushTargets = { branches: [], current: false, every: false, from: {} };
  try {
    for (const [, rest] of calls) {
      const args = words(rest ?? '');
      const positional: string[] = [];
      let all = false;
      let tags = false;
      let remove = false;
      for (let index = 0; index < args.length; index++) {
        const arg = args[index] ?? '';
        if (PUSH_VALUE_FLAGS.has(arg)) index++;
        else if (PUSH_UNTOLD.has(arg)) throw new Error(`${arg} writes branches it does not name`);
        else if (arg === '--all' || arg === '--branches') all = true;
        else if (arg === '--tags') tags = true;
        else if (arg === '--delete' || arg === '-d') remove = true;
        else if (!arg.startsWith('-')) positional.push(arg);
      }
      const [remote, ...refspecs] = positional;
      if (remote !== undefined && /[$`]/.test(remote))
        throw new Error(`"${remote}" is not a plain remote`);
      if (all) targets.every = true;
      else if (refspecs.length === 0 && !tags) targets.current = true;
      for (const refspec of refspecs) {
        const branch = refspecBranch(refspec);
        if (branch === CURRENT) targets.current = true;
        else if (branch !== undefined) {
          targets.branches.push(branch);
          const source = remove ? '' : refspecSource(refspec);
          if (source !== undefined) targets.from[branch] = source;
        }
      }
    }
  } catch (error) {
    return { unknown: (error as Error).message };
  }
  return targets;
}

// gh asks the forge over the network, so a hook never waits on it longer than this.
const GH_TIMEOUT_MS = 10_000;

// The head branch of a PR and the base branch it merges into, asked of gh in the repo at cwd (the
// PR of the branch checked out, when `pr` names none); throws when gh is missing, fails or takes
// too long.
export function prBranches(
  cwd: string,
  pr: string | undefined,
  gh = 'gh',
): { head: string; base: string } {
  const which = pr === undefined ? [] : [pr];
  let read = '';
  try {
    read = execFileSync(
      gh,
      [
        'pr',
        'view',
        ...which,
        '--json',
        'headRefName,baseRefName',
        '--jq',
        '.headRefName + " " + .baseRefName',
      ],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GH_TIMEOUT_MS },
    ).trim();
  } catch {}
  const [head = '', base = ''] = read.split(' ');
  if (head === '' || base === '') {
    throw new Error(
      `gh could not tell the branches of ${pr === undefined ? 'the PR' : `PR ${pr}`}`,
    );
  }
  return { head, base };
}
