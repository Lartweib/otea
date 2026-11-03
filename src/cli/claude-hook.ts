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

// gh asks the forge over the network, so a hook never waits on it longer than this.
const GH_TIMEOUT_MS = 10_000;

// The head branch of a PR, asked of gh in the repo at cwd; throws when gh is missing, fails or
// takes too long.
export function prHeadBranch(cwd: string, pr: string, gh = 'gh'): string {
  let branch = '';
  try {
    branch = execFileSync(gh, ['pr', 'view', pr, '--json', 'headRefName', '--jq', '.headRefName'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GH_TIMEOUT_MS,
    }).trim();
  } catch {}
  if (branch === '') throw new Error(`gh could not tell the head branch of PR ${pr}`);
  return branch;
}
