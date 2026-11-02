import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CommandFailure } from './command.ts';
import { gitPath, repoRoot } from './gitrepo.ts';

// What installing or removing a hook did to its file; `content` is what was written or removed.
export type HookChange = {
  path: string;
  action: 'created' | 'updated' | 'unchanged' | 'removed' | 'absent';
  content?: string;
  // Why the hook went where it did.
  note?: string;
};

// The first lines of the pre-push hook Otea writes; a hook without them is someone else's.
const MARK = '# otea-hook: pre-push';

// How a hook runs this checkout of Otea, as `otea connect` does for the MCP server.
function oteaCommand(main: string): string {
  return `node --disable-warning=ExperimentalWarning "${main}"`;
}

// Checks every branch the push sends, refusing only when otea check refuses (exit 1): if Otea
// cannot run at all, the push goes on.
function gitCheckLines(main: string): string {
  return [
    'while read -r local_ref local_sha remote_ref remote_sha; do',
    '  case "$local_ref" in',
    '    refs/heads/*)',
    `      ${oteaCommand(main)} check --gate push --branch "\${local_ref#refs/heads/}" --repo < /dev/null`,
    '      if [ $? -eq 1 ]; then exit 1; fi',
    '      ;;',
    '  esac',
    'done',
  ].join('\n');
}

function preHook(main: string): string {
  const header = [
    '#!/bin/sh',
    MARK,
    '# Written by otea hook install --git; otea hook remove --git removes it.',
  ];
  return `${[...header, gitCheckLines(main), 'exit 0'].join('\n')}\n`;
}

// The pre-push hook of the repo at cwd, wherever core.hooksPath puts it.
export function gitHookFile(cwd: string): string {
  return gitPath(cwd, 'hooks/pre-push');
}

export function installGitHook(cwd: string, main: string): HookChange {
  const path = gitHookFile(cwd);
  const content = preHook(main);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  if (current !== undefined && !current.includes(MARK)) {
    throw new CommandFailure(
      'already_exists',
      `${path} is another pre-push hook; Otea leaves it as it is. To gate pushes, add to it:\n\n${gitCheckLines(main)}`,
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

type ClaudeHook = { type: 'command'; if: string; command: string };
type HookGroup = { matcher?: string; hooks?: unknown[] };
type Settings = Record<string, unknown> & { hooks?: Record<string, unknown> };

// The Bash calls each gated action covers, as permission rules: each rule matches a command alone
// or with arguments.
const CLAUDE_GATES: ReadonlyArray<[string, string]> = [
  ['push', 'git push'],
  ['merge', 'gh pr merge'],
];

function claudeHooks(main: string): ClaudeHook[] {
  return CLAUDE_GATES.flatMap(([gate, command]) =>
    [`Bash(${command})`, `Bash(${command} *)`].map((rule) => ({
      type: 'command' as const,
      if: rule,
      command: `${oteaCommand(main)} check --gate ${gate} --branch --repo --claude-hook`,
    })),
  );
}

function isOurs(hook: unknown): boolean {
  const command = (hook as { command?: unknown } | null)?.command;
  return (
    typeof command === 'string' &&
    command.includes(' check --gate ') &&
    command.endsWith('--claude-hook')
  );
}

// The hooks name this machine's path to Otea, so they go to the settings of this machine only.
export function claudeSettingsFile(cwd: string): string {
  return join(repoRoot(cwd), '.claude', 'settings.local.json');
}

const LOCAL_NOTE =
  'settings.local.json is per machine and not committed: the hooks name the path to Otea on this machine';

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

// The settings with Otea's PreToolUse hooks taken out, and empty groups and keys with them.
function withoutOurs(settings: Settings): Settings {
  const groups = settings.hooks?.PreToolUse;
  if (!Array.isArray(groups)) return settings;
  const kept = groups.flatMap((group: HookGroup) => {
    if (!Array.isArray(group?.hooks)) return [group];
    const hooks = group.hooks.filter((hook) => !isOurs(hook));
    if (hooks.length === group.hooks.length) return [group];
    return hooks.length > 0 ? [{ ...group, hooks }] : [];
  });
  const { PreToolUse: _, ...events } = settings.hooks ?? {};
  const hooks = kept.length > 0 ? { ...events, PreToolUse: kept } : events;
  const { hooks: __, ...rest } = settings;
  return Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest;
}

function writeSettings(path: string, settings: Settings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}

export function installClaudeHook(cwd: string, main: string): HookChange {
  const path = claudeSettingsFile(cwd);
  const before = readSettings(path);
  const base = withoutOurs(before);
  const group = { matcher: 'Bash', hooks: claudeHooks(main) };
  const existing = Array.isArray(base.hooks?.PreToolUse) ? base.hooks.PreToolUse : [];
  const next: Settings = {
    ...base,
    hooks: { ...(base.hooks ?? {}), PreToolUse: [...existing, group] },
  };
  const content = JSON.stringify(group, null, 2);
  const note = LOCAL_NOTE;
  if (JSON.stringify(next) === JSON.stringify(before)) {
    return { path, action: 'unchanged', content, note };
  }
  const existed = existsSync(path);
  writeSettings(path, next);
  return { path, action: existed ? 'updated' : 'created', content, note };
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
