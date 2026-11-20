import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { repoOfItem } from '../app/gates.ts';
import type { Item } from '../app/items.ts';
import { type Launcher, shellLine } from '../app/launcher.ts';
import type { Project } from '../app/project.ts';
import { checkoutsOf } from '../app/repos.ts';
import { CommandFailure } from './command.ts';
import { EXIT_CODES } from './exit-codes.ts';
import { gitPath, repoRoot } from './gitrepo.ts';

// What installing or removing a hook did to its file; `content` is what was written or removed.
export type HookChange = {
  path: string;
  action: 'created' | 'updated' | 'unchanged' | 'removed' | 'absent';
  content?: string;
  // Why the hook went where it did.
  note?: string;
  // What Otea says it did, when not one of a hook's words (the forge's ruleset).
  said?: string;
};

// The first lines of the pre-push hook Otea writes; a hook without them is someone else's.
const MARK = '# otea-hook: pre-push';

// How a hook runs this Otea, as `otea connect` does for the MCP server.
const oteaCommand = shellLine;

// Checks every branch the push writes to or deletes on the remote, not the local branch it sends
// from, which may be another; refuses when otea check refuses (gate_refused). It fails closed: when
// Otea fails or cannot run at all, the push stops too, saying so, with the person's way past it
// (Plan 7, item 4); only a gate nothing declares (invalid_gate: the project gates no push) lets it
// go. Tags and other refs are not branches and go unchecked. --commits names what the remote has
// and what it gets, so a push into a base branch a board protects is checked against the branches
// it brings in. Otea's language is unknown when it cannot run: the person's line is in both.
function gitCheckLines(otea: Launcher): string {
  const failed = [
    'Otea could not check this push of $branch (exit $code), so it does not go through: make sure otea runs here (otea check --gate push --branch $branch --repo), then push again.',
    "For the person: to push it yourself this once, git push --no-verify, which skips Otea's check. An agent never uses --no-verify.",
    'Para la persona: para subirlo tú esta vez, git push --no-verify, que se salta la revisión de Otea. Un agente nunca usa --no-verify.',
  ];
  return [
    'while read -r local_ref local_sha remote_ref remote_sha; do',
    '  case "$remote_ref" in',
    '    refs/heads/*)',
    '      branch="${remote_ref#refs/heads/}"',
    `      ${oteaCommand(otea)} check --gate push --branch "$branch" --repo --commits "$remote_sha..$local_sha" < /dev/null`,
    '      code=$?',
    `      if [ $code -eq ${EXIT_CODES.gate_refused} ]; then exit 1; fi`,
    `      if [ $code -ne 0 ] && [ $code -ne ${EXIT_CODES.invalid_gate} ]; then`,
    ...failed.map((line) => `        echo "${line}" >&2`),
    '        exit 1',
    '      fi',
    '      ;;',
    '  esac',
    'done',
  ].join('\n');
}

function preHook(otea: Launcher): string {
  const header = [
    '#!/bin/sh',
    MARK,
    '# Written by otea hook install --git; otea hook remove --git removes it.',
  ];
  return `${[...header, gitCheckLines(otea), 'exit 0'].join('\n')}\n`;
}

// The pre-push hook of the repo at cwd, wherever core.hooksPath puts it.
export function gitHookFile(cwd: string): string {
  return gitPath(cwd, 'hooks/pre-push');
}

export function installGitHook(cwd: string, otea: Launcher): HookChange {
  let path: string;
  try {
    path = gitHookFile(cwd);
  } catch {
    throw new CommandFailure(
      'not_found',
      `${cwd} is not in a git repository: a pre-push hook goes in one (run otea hook install --git in the repo)`,
    );
  }
  const content = preHook(otea);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  if (current !== undefined && !current.includes(MARK)) {
    throw new CommandFailure(
      'already_exists',
      `${path} is another pre-push hook; Otea leaves it as it is. To gate pushes, add to it:\n\n${gitCheckLines(otea)}`,
    );
  }
  const note = gitHookNote(path);
  if (current === content) return { path, action: 'unchanged', content, note };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  chmodSync(path, 0o755);
  return { path, action: current === undefined ? 'created' : 'updated', content, note };
}

// The hook names this machine's path to Otea: fine in .git/hooks, never committed, but a hooks
// folder that core.hooksPath puts in the work tree may be.
function gitHookNote(path: string): string {
  if (path.split(/[\\/]/).includes('.git')) {
    return '.git/hooks is per machine and never committed: the hook names the path to Otea on this machine';
  }
  return 'core.hooksPath puts it outside .git: do not commit it, the hook names the path to Otea on this machine';
}

// The pre-push hook of the repo at cwd: Otea's (or one of its own that runs Otea's check, as the
// lines hook install prints), another one, or none (none outside a repo too).
type GitHookKind = 'otea' | 'foreign' | 'none';

function gitHookKind(cwd: string): GitHookKind {
  try {
    const path = gitHookFile(cwd);
    if (!existsSync(path)) return 'none';
    const content = readFileSync(path, 'utf8');
    return content.includes(MARK) || content.includes('check --gate push') ? 'otea' : 'foreign';
  } catch {
    return 'none';
  }
}

// Whether the repo at cwd has Otea's pre-push hook, which makes its gates hard; false outside a repo.
export function hasOteaGitHook(cwd: string): boolean {
  return gitHookKind(cwd) === 'otea';
}

// Where the repo a repo task names is checked out in the project's folders, and which of those
// checkouts have Otea's pre-push hook: a push from one without it is never checked. `foreign`: the
// checkouts with a pre-push hook of their own, which install leaves alone: Otea's check goes in it.
export type GitHookStatus = {
  repo: string;
  installed: string[];
  missing: string[];
  foreign?: string[];
};

export function gitHookOf(project: Project, item: Item): GitHookStatus | undefined {
  const repo = repoOfItem(project, item);
  if (typeof repo !== 'string' || repo.trim() === '') return undefined;
  const kinds = checkoutsOf(project, repo).map((path) => ({ path, kind: gitHookKind(path) }));
  const of = (kind: GitHookKind) => kinds.filter((c) => c.kind === kind).map(({ path }) => path);
  const foreign = of('foreign');
  return {
    repo,
    installed: of('otea'),
    missing: of('none'),
    ...(foreign.length > 0 ? { foreign } : {}),
  };
}

export function removeGitHook(cwd: string): HookChange {
  const path = gitHookFile(cwd);
  if (!existsSync(path)) return { path, action: 'absent' };
  const content = readFileSync(path, 'utf8');
  if (!content.includes(MARK)) {
    throw new CommandFailure(
      'forbidden',
      `${path} is not Otea's pre-push hook; remove it yourself`,
    );
  }
  rmSync(path);
  return { path, action: 'removed', content };
}

type HookGroup = { matcher?: string; hooks?: unknown[] };
type Settings = Record<string, unknown> & {
  hooks?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
};

// Otea no longer writes Claude Code hooks: correctness never depends on a harness. hook remove
// --claude still takes out what an older otea hook install --claude wrote (the PreToolUse gate
// that ran otea check --claude-hook, the Stop hook that ran otea topic session, and these allow
// rules), since the commands those hooks run are gone.
const CLAUDE_TOPIC_RULES: readonly string[] = [
  'Bash(otea topic add *)',
  'Bash(otea topic answer *)',
  'mcp__otea__topic_add',
  'mcp__otea__topic_answer',
];

function isOurs(hook: unknown): boolean {
  const command = (hook as { command?: unknown } | null)?.command;
  return (
    typeof command === 'string' &&
    (command.includes(' check --gate ') || command.includes(' topic session ')) &&
    command.endsWith('--claude-hook')
  );
}

// Where an older otea hook install --claude wrote its hooks.
function claudeSettingsFile(cwd: string): string {
  return join(repoRoot(cwd), '.claude', 'settings.local.json');
}

function readSettings(path: string): Settings {
  if (!existsSync(path)) return {};
  try {
    const settings: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (settings !== null && typeof settings === 'object' && !Array.isArray(settings)) {
      return settings as Settings;
    }
  } catch {}
  throw new CommandFailure(
    'invalid_fields',
    `${path} is not a JSON object; fix it, then try again`,
  );
}

// The settings with Otea's hooks (PreToolUse and Stop) taken out, and empty groups and keys with
// them.
function withoutOurs(settings: Settings): Settings {
  let hooks: Record<string, unknown> = { ...(settings.hooks ?? {}) };
  for (const event of ['PreToolUse', 'Stop']) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) continue;
    const kept = groups.flatMap((group: HookGroup) => {
      if (!Array.isArray(group?.hooks)) return [group];
      const left = group.hooks.filter((hook) => !isOurs(hook));
      if (left.length === group.hooks.length) return [group];
      return left.length > 0 ? [{ ...group, hooks: left }] : [];
    });
    const { [event]: _, ...others } = hooks;
    hooks = kept.length > 0 ? { ...others, [event]: kept } : others;
  }
  const { hooks: __, permissions, ...rest } = settings;
  const kept = withoutOurRules(permissions);
  const others = kept === undefined ? rest : { ...rest, permissions: kept };
  return Object.keys(hooks).length > 0 ? { ...others, hooks } : others;
}

// The permissions with Otea's allow rules taken out, and an empty allow list and permissions with
// them.
function withoutOurRules(
  permissions: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (permissions === undefined || !Array.isArray(permissions.allow)) return permissions;
  const allow = permissions.allow.filter((rule) => !CLAUDE_TOPIC_RULES.includes(rule));
  const { allow: _, ...others } = permissions;
  const kept = allow.length > 0 ? { ...others, allow } : others;
  return Object.keys(kept).length > 0 ? kept : undefined;
}

function writeSettings(path: string, settings: Settings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}

export function removeClaudeHook(cwd: string): HookChange {
  const path = claudeSettingsFile(cwd);
  if (!existsSync(path)) return { path, action: 'absent' };
  const before = readSettings(path);
  const after = withoutOurs(before);
  if (JSON.stringify(after) === JSON.stringify(before)) return { path, action: 'absent' };
  // A file that held only Otea's hooks goes with them.
  if (Object.keys(after).length === 0) rmSync(path);
  else writeSettings(path, after);
  return { path, action: 'removed' };
}
