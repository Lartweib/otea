import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moveItem } from '../app/items.ts';
import { openProject } from '../app/project.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

describe('hook', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const read = (path: string) => readFileSync(join(repo.dir, path), 'utf8');
  const settings = () => JSON.parse(read('.claude/settings.local.json'));

  beforeEach(() => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
  });

  afterEach(() => repo.remove());

  it('needs --git, --claude or both', async () => {
    const result = await otea('hook', 'install');

    expect(result.code).toBe(2);
    expect(result.err).toContain('Name the hook: --git, --claude or both');
  });

  describe('--git', () => {
    it('writes a pre-push hook that checks every pushed branch, and says what it wrote', async () => {
      const result = await otea('hook', 'install', '--git');
      const hook = read('.git/hooks/pre-push');

      expect(result.code).toBe(0);
      expect(result.out).toContain(
        `Wrote ${join(repo.dir, '.git', 'hooks', 'pre-push')} (.git/hooks is per machine and never committed: the hook names the path to Otea on this machine):`,
      );
      expect(result.out).toContain('  # otea-hook: pre-push');
      expect(hook.startsWith('#!/bin/sh\n# otea-hook: pre-push\n')).toBe(true);
      expect(hook).toContain(`check --gate push --branch "\${local_ref#refs/heads/}" --repo`);
      expect(hook).toContain('if [ $? -eq 1 ]; then exit 1; fi');
      if (process.platform !== 'win32') {
        expect(statSync(join(repo.dir, '.git/hooks/pre-push')).mode & 0o111).not.toBe(0);
      }
    });

    it('is idempotent and removed cleanly', async () => {
      await otea('hook', 'install', '--git');

      expect((await otea('hook', 'install', '--git')).out).toContain('already has the Otea hook');
      expect((await otea('hook', 'remove', '--git')).out).toContain('Removed the Otea hook from');
      expect(existsSync(join(repo.dir, '.git/hooks/pre-push'))).toBe(false);
      expect((await otea('hook', 'remove', '--git')).out).toContain('has no Otea hook');
    });

    it('never overwrites or removes a pre-push hook of someone else', async () => {
      repo.write('.git/hooks/pre-push', '#!/bin/sh\necho mine\n');

      const install = await otea('hook', 'install', '--git');
      expect(install.code).toBe(5);
      expect(install.err).toContain('is another pre-push hook; Otea leaves it as it is');
      expect(install.err).toContain('check --gate push --branch');
      expect((await otea('hook', 'remove', '--git')).code).toBe(7);
      expect(read('.git/hooks/pre-push')).toBe('#!/bin/sh\necho mine\n');
    });

    it('writes it where core.hooksPath points', async () => {
      execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: repo.dir });

      await otea('hook', 'install', '--git');

      expect(read('.githooks/pre-push')).toContain('# otea-hook: pre-push');
      expect(existsSync(join(repo.dir, '.git/hooks/pre-push'))).toBe(false);
    });
  });

  describe('--claude', () => {
    it('adds PreToolUse hooks for git push and gh pr merge, keeping the other settings', async () => {
      repo.write(
        '.claude/settings.local.json',
        JSON.stringify({
          permissions: { allow: ['Bash(npm test)'] },
          hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'x' }] }] },
        }),
      );

      const result = await otea('hook', 'install', '--claude');
      const { permissions, hooks } = settings();
      const [theirs, ours] = hooks.PreToolUse;

      expect(result.out).toContain(
        'settings.local.json (settings.local.json is per machine and not committed: the hooks name the path to Otea on this machine):',
      );
      expect(permissions).toEqual({ allow: ['Bash(npm test)'] });
      expect(theirs).toEqual({ matcher: 'Edit', hooks: [{ type: 'command', command: 'x' }] });
      expect(ours.matcher).toBe('Bash');
      expect(ours.hooks.map((hook: { if: string }) => hook.if)).toEqual([
        'Bash(git push)',
        'Bash(git push *)',
        'Bash(gh pr merge)',
        'Bash(gh pr merge *)',
      ]);
      expect(ours.hooks[0].command).toMatch(/check --gate push --branch --repo --claude-hook$/);
      expect(ours.hooks[2].command).toMatch(/check --gate merge --branch --repo --claude-hook$/);
    });

    it('is idempotent, and remove leaves the settings as they were', async () => {
      const before = { permissions: { allow: ['Bash(npm test)'] } };
      repo.write('.claude/settings.local.json', JSON.stringify(before));
      await otea('hook', 'install', '--claude');

      expect((await otea('hook', 'install', '--claude')).out).toContain(
        'already has the Otea hook',
      );
      await otea('hook', 'remove', '--claude');
      expect(settings()).toEqual(before);
    });

    it('removes a settings file that held only its hooks', async () => {
      await otea('hook', 'install', '--claude', '--git');
      await otea('hook', 'remove', '--claude', '--git');

      expect(existsSync(join(repo.dir, '.claude/settings.local.json'))).toBe(false);
      expect(existsSync(join(repo.dir, '.git/hooks/pre-push'))).toBe(false);
    });
  });

  describe('otea check --claude-hook', () => {
    beforeEach(async () => {
      execFileSync('git', ['checkout', '--quiet', '-b', 'chg-1/keys'], { cwd: repo.dir });
      await otea('init', '--template', 'none');
      await otea('collection', 'add', 'changes', '--preset', 'change');
      await otea('create', '--collection', 'changes', '--title', 'Keys');
      await otea(
        'create',
        '--collection',
        'Tareas de repo',
        '--parent',
        'CHANGES-1',
        '--title',
        'Keys',
        '--field',
        'repo=elsewhere',
        '--field',
        'branch=chg-1/keys',
      );
    });

    // The hook runs from wherever Claude Code started; the event's cwd is where the call runs.
    const hook = (cwd: string, ...argv: string[]) => {
      const event = { cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash' };
      const at = cliAt(
        join(repo.dir, '..'),
        {},
        undefined,
        undefined,
        undefined,
        JSON.stringify(event),
      );
      return at('check', '--gate', 'push', ...argv, '--claude-hook');
    };

    it('refuses with exit 2 and the reason on stderr, which blocks the tool call', async () => {
      expect(await hook(repo.dir, '--branch', '--repo', 'elsewhere')).toEqual({
        code: 2,
        out: '',
        err: 'otea: push refused: TAR-1 is in Propuesta; its branch can be pushed only while Implementar is being done.\n',
      });
    });

    it('lets the call through when allowed, unmatched or unreadable', async () => {
      const project = openProject(repo.dir);
      try {
        moveItem(project, {
          id: 'TAR-1',
          to: 'implementing',
          actor: { kind: 'human', name: 'ana' },
          channel: 'ui',
        });
      } finally {
        project.db.close();
      }

      expect((await hook(repo.dir, '--branch', '--repo', 'elsewhere')).code).toBe(0);
      expect((await hook(repo.dir, '--branch', '--repo')).code).toBe(0);
      const garbled = cliAt(repo.dir, {}, undefined, undefined, undefined, 'not json');
      const result = await garbled('check', '--gate', 'push', '--branch', '--claude-hook');
      expect(result.code).toBe(0);
      expect(result.err).toContain('could not check');
    });

    const merge = (command: string) => {
      const event = { cwd: repo.dir, tool_name: 'Bash', tool_input: { command } };
      const at = cliAt(repo.dir, {}, undefined, undefined, undefined, JSON.stringify(event));
      return at('check', '--gate', 'merge', '--branch', '--repo', 'elsewhere', '--claude-hook');
    };

    it('checks a bare gh pr merge against the current branch', async () => {
      const result = await merge('gh pr merge --squash');

      expect(result.code).toBe(2);
      expect(result.err).toContain('merge refused: TAR-1 is in Propuesta');
    });
  });
});
