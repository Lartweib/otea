import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { oteaLauncher } from '../app/launcher.ts';
import type { ForgeCli, Ruleset } from './forge.ts';
import { installGitHook } from './hooks.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

describe('hook', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const read = (path: string) => readFileSync(join(repo.dir, path), 'utf8');
  const settings = () => JSON.parse(read('.claude/settings.local.json'));

  beforeEach(() => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
  });

  afterEach(() => repo.remove());

  it('needs --git, and installs no harness hook', async () => {
    const result = await otea('hook', 'install');

    expect(result.code).toBe(2);
    expect(result.err).toContain('Name the hook: --git or --forge');
    const claude = await otea('hook', 'install', '--claude');
    expect(claude.code).toBe(2);
    expect(existsSync(join(repo.dir, '.claude'))).toBe(false);
  });

  // GitHub enforces the base branches the boards protect, for any tool; gh is a stand-in here, so
  // no test reaches GitHub.
  describe('--forge', () => {
    const forge = (): ForgeCli & { saved: Ruleset[] } => {
      const saved: Ruleset[] = [];
      return {
        saved,
        status: () => 'ready',
        repo: () => 'acme/keys',
        rulesets: () => saved.map(({ name }, index) => ({ id: index + 1, name })),
        saveRuleset: (_cwd, _repo, ruleset, id) => {
          if (id === undefined) saved.push(ruleset);
          else saved[id - 1] = ruleset;
        },
        deleteRuleset: (_cwd, _repo, id) => {
          saved.splice(id - 1, 1);
        },
      };
    };

    beforeEach(async () => {
      const person = cliAt(repo.dir);
      expect((await person('init', '--template', 'none')).code).toBe(0);
      expect((await person('board', 'add', 'Cambios', '--template', 'changes')).code).toBe(0);
    });

    it('sets a GitHub ruleset on the base branch the board protects, and takes it off', async () => {
      const gh = forge();
      const at = cliAt(repo.dir, {}, undefined, undefined, undefined, undefined, false, {
        forge: gh,
      });

      const install = await at('hook', 'install', '--forge');
      expect(install.code).toBe(0);
      expect(install.out).toContain(
        'Set the ruleset "Otea: protected base branches" on github.com/acme/keys (GitHub now refuses a direct push, a force push and a deletion of main from any tool',
      );
      expect(gh.saved.map(({ conditions }) => conditions.ref_name.include)).toEqual([
        ['refs/heads/main'],
      ]);
      expect((await at('hook', 'install', '--forge')).out).toContain('Updated the ruleset');
      expect(gh.saved).toHaveLength(1);

      const removed = await at('hook', 'remove', '--forge');
      expect(removed.out).toContain('Removed the ruleset "Otea: protected base branches"');
      expect(gh.saved).toEqual([]);
    });

    it('prints the steps by hand when gh is not there, and still writes the git hook', async () => {
      const install = await otea('hook', 'install', '--git', '--forge');

      expect(install.code).toBe(22);
      expect(install.err).toContain('Wrote');
      expect(install.err).toContain('gh, the GitHub CLI, is not installed. To have GitHub enforce');
      expect(install.err).toContain('Settings > Rules > Rulesets > New ruleset');
      expect(existsSync(join(repo.dir, '.git/hooks/pre-push'))).toBe(true);
    });
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
      expect(hook).toContain(
        `check --gate push --branch "$branch" --repo --commits "$remote_sha..$local_sha"`,
      );
      expect(hook).toContain('if [ $code -eq 19 ]; then exit 1; fi');
      expect(hook).toContain('if [ $code -ne 0 ] && [ $code -ne 2 ]; then');
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

    it('says a pre-push hook needs a git repository', async () => {
      const outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-nogit-')));
      try {
        const install = await cliAt(outside, { OTEA_AGENT: 'claude' })('hook', 'install', '--git');

        expect(install.code).toBe(3);
        expect(install.err).toContain(
          `${outside} is not in a git repository: a pre-push hook goes in one`,
        );
        expect(install.err).not.toContain('Command failed');
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    // A real push through the hook, with a stand-in for Otea that logs the branch it is asked
    // about and refuses `frozen`.
    describe('on a push', () => {
      let remote: ReturnType<typeof tempGitRepo>;
      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: repo.dir, stdio: 'pipe', encoding: 'utf8' });
      const push = (...args: string[]) => {
        try {
          git('push', '--quiet', remote.dir, ...args);
          return 0;
        } catch (error) {
          return (error as { status: number }).status;
        }
      };
      const asked = () => read('asked.log').split('\n').filter(Boolean);

      beforeEach(() => {
        remote = tempGitRepo();
        execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main'], {
          cwd: remote.dir,
        });
        repo.write(
          'otea.mjs',
          [
            "import { appendFileSync } from 'node:fs';",
            "const branch = process.argv[process.argv.indexOf('--branch') + 1];",
            `appendFileSync(${JSON.stringify(join(repo.dir, 'asked.log'))}, branch + '\\n');`,
            'process.exit({ frozen: 19, broken: 1, nogate: 2 }[branch] ?? 0);',
          ].join('\n'),
        );
        const author = ['-c', 'user.name=t', '-c', 'user.email=t@t'];
        git(...author, 'commit', '--quiet', '--allow-empty', '-m', 'one');
        installGitHook(repo.dir, oteaLauncher(join(repo.dir, 'otea.mjs'), { execPath: 'node' }));
      });

      afterEach(() => remote.remove());

      it('checks the branch the push writes to, not the one it sends from', () => {
        expect(push('HEAD:refs/heads/frozen', '--force')).toBe(1);
        git('branch', 'frozen');
        expect(push('frozen:refs/heads/open', '+HEAD:loose')).toBe(0);

        expect(asked()).toEqual(['frozen', 'open', 'loose']);
      });

      // Plan 7 item 4: the hook passed on anything but 19, so an Otea that failed or could not run
      // let a gated push through. It fails closed, saying so, with the person's way past it; a
      // gate nothing declares (2) still lets the push go.
      it('refuses the push when Otea fails or cannot run, and says how the person gets past it', () => {
        let said = '';
        try {
          git('push', '--quiet', remote.dir, 'HEAD:refs/heads/broken');
        } catch (error) {
          said = String((error as { stderr: string }).stderr);
        }
        expect(said).toContain('Otea could not check this push of broken (exit 1)');
        expect(said).toContain('git push --no-verify');
        expect(said).toContain('Para la persona');
        expect(push('HEAD:refs/heads/nogate')).toBe(0);

        installGitHook(repo.dir, oteaLauncher(join(repo.dir, 'missing.mjs'), { execPath: 'node' }));
        expect(push('HEAD:refs/heads/open')).toBe(1);
      });

      it('checks a branch the push deletes, and leaves tags alone', () => {
        git('push', '--quiet', '--no-verify', remote.dir, 'HEAD:refs/heads/frozen');

        expect(push('--delete', 'frozen')).toBe(1);
        expect(push('HEAD:refs/tags/v1')).toBe(0);
        expect(asked()).toEqual(['frozen']);
      });

      // Otea where a real install puts it, in a folder with spaces (C:\Program Files\nodejs, a
      // user's AppData), with backslashes on Windows: the hook's shell line quotes each path, and
      // git's sh, git-bash's on Windows, must run it whole. A line it split would fail to start
      // Otea, and the push would go on unchecked.
      it.each([
        ['a checkout, on Node', (main: string) => oteaLauncher(main, { execPath: 'node' })],
        [
          'the desktop app, on its own runtime',
          (main: string) => oteaLauncher(main, { execPath: process.execPath, electron: '45.2.1' }),
        ],
      ])('runs Otea from a path with spaces: %s', (_, launcherOf) => {
        const main = join(repo.dir, 'Program Files', 'Otea app', 'otea.mjs');
        repo.write(join('Program Files', 'Otea app', 'otea.mjs'), read('otea.mjs'));
        installGitHook(repo.dir, launcherOf(main));

        expect(push('HEAD:refs/heads/frozen')).toBe(1);
        expect(push('HEAD:refs/heads/open')).toBe(0);
        expect(asked()).toEqual(['frozen', 'open']);
      });
    });

    it('writes it where core.hooksPath points', async () => {
      execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: repo.dir });

      await otea('hook', 'install', '--git');

      expect(read('.githooks/pre-push')).toContain('# otea-hook: pre-push');
      expect(existsSync(join(repo.dir, '.git/hooks/pre-push'))).toBe(false);
    });
  });

  // otea hook install --claude is gone (no gate depends on a harness hook); hook remove --claude
  // still takes out what it wrote, whose commands no longer exist.
  describe('remove --claude', () => {
    const OLD = {
      permissions: {
        allow: [
          'Bash(npm test)',
          'Bash(otea topic add *)',
          'Bash(otea topic answer *)',
          'mcp__otea__topic_add',
          'mcp__otea__topic_answer',
        ],
      },
      hooks: {
        PreToolUse: [
          { matcher: 'Edit', hooks: [{ type: 'command', command: 'x' }] },
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                if: 'Bash(git push)',
                command: 'otea check --gate push --branch --repo --claude-hook',
              },
              {
                type: 'command',
                if: 'Bash(gh pr merge *)',
                command: 'otea check --gate merge --branch --repo --claude-hook',
              },
            ],
          },
        ],
        Stop: [{ hooks: [{ type: 'command', command: 'otea topic session --claude-hook' }] }],
      },
    };

    it('takes out the old Claude Code hooks and allow rules, keeping the other settings', async () => {
      repo.write('.claude/settings.local.json', JSON.stringify(OLD));

      const result = await otea('hook', 'remove', '--claude');

      expect(result.code).toBe(0);
      expect(result.out).toContain('Removed the Otea hook from');
      expect(settings()).toEqual({
        permissions: { allow: ['Bash(npm test)'] },
        hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'x' }] }] },
      });
      expect((await otea('hook', 'remove', '--claude')).out).toContain('has no Otea hook');
    });

    it('removes a settings file that held only the old hooks', async () => {
      const { hooks } = OLD;
      repo.write(
        '.claude/settings.local.json',
        JSON.stringify({ hooks: { PreToolUse: [hooks.PreToolUse[1]], Stop: hooks.Stop } }),
      );
      await otea('hook', 'install', '--git');

      await otea('hook', 'remove', '--claude', '--git');

      expect(existsSync(join(repo.dir, '.claude/settings.local.json'))).toBe(false);
      expect(existsSync(join(repo.dir, '.git/hooks/pre-push'))).toBe(false);
    });
  });
});
