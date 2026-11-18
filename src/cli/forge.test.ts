import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CommandFailure } from './command.ts';
import {
  type ForgeCli,
  forgeSteps,
  ghForge,
  installForge,
  RULESET_NAME,
  type Ruleset,
  removeForge,
  rulesetFor,
} from './forge.ts';

// A stand-in for gh: it keeps the rulesets it is given, as GitHub would, and never leaves this
// process.
function fakeForge(status: ReturnType<ForgeCli['status']> = 'ready', repo = 'acme/keys') {
  const saved: { id: number; name: string; ruleset?: Ruleset }[] = [];
  const calls: string[] = [];
  const forge: ForgeCli = {
    status: () => status,
    repo: () => repo,
    rulesets: () => saved.map(({ id, name }) => ({ id, name })),
    saveRuleset: (_cwd, at, ruleset, id) => {
      calls.push(`${id === undefined ? 'create' : `replace ${id}`} on ${at}`);
      if (id === undefined) saved.push({ id: saved.length + 10, name: ruleset.name, ruleset });
      else Object.assign(saved.find((entry) => entry.id === id) ?? {}, { ruleset });
    },
    deleteRuleset: (_cwd, at, id) => {
      calls.push(`delete ${id} on ${at}`);
      saved.splice(
        saved.findIndex((entry) => entry.id === id),
        1,
      );
    },
  };
  return { forge, saved, calls };
}

const refusal = (run: () => unknown): CommandFailure => {
  try {
    run();
  } catch (error) {
    if (error instanceof CommandFailure) return error;
    throw error;
  }
  throw new Error('it did not refuse');
};

// The real gh adapter, run against a stand-in gh script that logs what it is asked and keeps the
// rulesets in a file, as GitHub's API would answer them.
describe('ghForge', () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-gh-')));
  const fake = join(dir, 'gh.mjs');
  writeFileSync(
    fake,
    [
      "import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';",
      `const dir = ${JSON.stringify(dir)};`,
      'const args = process.argv.slice(2);',
      "appendFileSync(dir + '/calls.log', args.join(' ') + '\\n');",
      "const store = dir + '/rulesets.json';",
      "const kept = existsSync(store) ? JSON.parse(readFileSync(store, 'utf8')) : [];",
      "const stdin = () => JSON.parse(readFileSync(0, 'utf8'));",
      "if (args[0] === 'auth' && process.env.SIGNED_OUT) process.exit(1);",
      "if (args[0] === 'repo') console.log('acme/keys');",
      "if (args[0] === 'api' && args.length === 2) console.log(JSON.stringify(kept));",
      "if (args[1] === '-X' && args[2] === 'POST') { kept.push({ id: 7, ...stdin() }); writeFileSync(store, JSON.stringify(kept)); }",
      "if (args[1] === '-X' && args[2] === 'PUT') { kept[0] = { id: 7, ...stdin() }; writeFileSync(store, JSON.stringify(kept)); }",
      "if (args[1] === '-X' && args[2] === 'DELETE') writeFileSync(store, '[]');",
    ].join('\n'),
  );
  const forge = ghForge(process.execPath, [fake]);
  const calls = () => readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n');

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('asks gh for its state and repo, then creates, replaces and deletes the ruleset', () => {
    expect(forge.status(dir)).toBe('ready');
    expect(forge.repo(dir)).toBe('acme/keys');

    expect(installForge(dir, ['main'], forge).action).toBe('created');
    expect(installForge(dir, ['main'], forge).action).toBe('updated');
    const stored = JSON.parse(readFileSync(join(dir, 'rulesets.json'), 'utf8'));
    expect(stored).toEqual([{ id: 7, ...rulesetFor(['main']) }]);
    expect(removeForge(dir, forge).action).toBe('removed');

    expect(calls()).toEqual([
      '--version',
      'auth status',
      'repo view --json nameWithOwner --jq .nameWithOwner',
      '--version',
      'auth status',
      'repo view --json nameWithOwner --jq .nameWithOwner',
      'api repos/acme/keys/rulesets',
      'api -X POST repos/acme/keys/rulesets --input -',
      '--version',
      'auth status',
      'repo view --json nameWithOwner --jq .nameWithOwner',
      'api repos/acme/keys/rulesets',
      'api -X PUT repos/acme/keys/rulesets/7 --input -',
      '--version',
      'auth status',
      'repo view --json nameWithOwner --jq .nameWithOwner',
      'api repos/acme/keys/rulesets',
      'api -X DELETE repos/acme/keys/rulesets/7',
    ]);
  });

  it('tells a missing gh from one that is signed out', () => {
    expect(ghForge(join(dir, 'no-such-gh')).status(dir)).toBe('missing');
    process.env.SIGNED_OUT = '1';
    try {
      expect(forge.status(dir)).toBe('signed-out');
    } finally {
      delete process.env.SIGNED_OUT;
    }
  });
});

describe('forge protection', () => {
  it('asks GitHub to refuse direct pushes, force pushes and deletions of the protected bases', () => {
    expect(rulesetFor(['main', 'release'])).toEqual({
      name: RULESET_NAME,
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['refs/heads/main', 'refs/heads/release'], exclude: [] } },
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        {
          type: 'pull_request',
          parameters: {
            required_approving_review_count: 0,
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: false,
            require_last_push_approval: false,
            required_review_thread_resolution: false,
          },
        },
      ],
    });
  });

  it('creates the ruleset once, then replaces its own on the next install', () => {
    const { forge, saved, calls } = fakeForge();

    const first = installForge('/repo', ['main'], forge);
    expect(first).toMatchObject({
      path: 'github.com/acme/keys',
      action: 'created',
    });
    expect(first.note).toContain('refuses a direct push, a force push and a deletion of main');
    expect(installForge('/repo', ['main'], forge).action).toBe('updated');

    expect(calls).toEqual(['create on acme/keys', 'replace 10 on acme/keys']);
    expect(saved).toHaveLength(1);
  });

  it('removes only its own ruleset', () => {
    const { forge, saved, calls } = fakeForge();
    saved.push({ id: 3, name: 'the team rules' });
    installForge('/repo', ['main'], forge);

    expect(removeForge('/repo', forge).action).toBe('removed');
    expect(removeForge('/repo', forge).action).toBe('absent');
    expect(calls.at(-1)).toBe('delete 11 on acme/keys');
    expect(saved.map(({ name }) => name)).toEqual(['the team rules']);
  });

  it('prints the exact steps when gh is missing, signed out or finds no GitHub repo', () => {
    for (const [status, why] of [
      ['missing', 'gh, the GitHub CLI, is not installed'],
      ['signed-out', 'gh is not signed in (gh auth status)'],
    ] as const) {
      const failed = refusal(() => installForge('/repo', ['main'], fakeForge(status).forge));
      expect(failed.failure).toBe('forge_unavailable');
      expect(failed.message).toBe(forgeSteps(['main'], why));
    }
    const { forge } = fakeForge();
    forge.repo = () => undefined;
    expect(refusal(() => installForge('/repo', ['main'], forge)).message).toContain(
      'gh finds no GitHub repository for /repo',
    );
    expect(forgeSteps(['main'], 'x')).toContain(
      'Turn on Restrict deletions, Block force pushes, and Require a pull request before merging',
    );
  });

  it('prints the steps when GitHub refuses the ruleset, with what gh said', () => {
    const { forge } = fakeForge();
    forge.saveRuleset = () => {
      throw Object.assign(new Error('failed'), { stderr: 'HTTP 403: Upgrade to GitHub Pro' });
    };

    const failed = refusal(() => installForge('/repo', ['main'], forge));
    expect(failed.message).toContain(
      'gh could not set the ruleset on acme/keys (HTTP 403: Upgrade to GitHub Pro)',
    );
    expect(failed.message).toContain('Settings > Rules > Rulesets');
  });

  it('refuses when no board protects a base branch', () => {
    const failed = refusal(() => installForge('/repo', [], fakeForge().forge));
    expect(failed.failure).toBe('not_found');
    expect(failed.message).toContain('No board protects a base branch');
  });
});
