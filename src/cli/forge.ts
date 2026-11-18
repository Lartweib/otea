import { execFileSync } from 'node:child_process';
import { CommandFailure } from './command.ts';
import { GH_TIMEOUT_MS } from './gh.ts';
import type { HookChange } from './hooks.ts';

// Forge protection: the base branches a board protects (guard.base) get a GitHub ruleset, so the
// forge itself refuses a push straight onto them, a force push and a deletion, whatever tool runs
// it; changes reach them only through a pull request. Otea's own gates stay in otea check and the
// pre-push hook; this is what holds when a tool skips them. The gh CLI sits behind ForgeCli, so
// tests fake it and never reach GitHub.

// One ruleset as GitHub lists it.
export type ForgeRuleset = { id: number; name: string };

export type ForgeCli = {
  // Whether gh is installed and signed in: 'missing' (no gh), 'signed-out' (gh auth status fails).
  status(cwd: string): 'ready' | 'missing' | 'signed-out';
  // The GitHub repository of the checkout at cwd, as owner/name; undefined when it is none.
  repo(cwd: string): string | undefined;
  rulesets(cwd: string, repo: string): ForgeRuleset[];
  // Creates the ruleset, or replaces the one of that id.
  saveRuleset(cwd: string, repo: string, ruleset: Ruleset, id?: number): void;
  deleteRuleset(cwd: string, repo: string, id: number): void;
};

export const NO_FORGE: ForgeCli = {
  status: () => 'missing',
  repo: () => undefined,
  rulesets: () => [],
  saveRuleset: () => {
    throw new Error('no gh');
  },
  deleteRuleset: () => {
    throw new Error('no gh');
  },
};

// The ruleset Otea keeps, by its name: one for every base branch the project's boards protect.
export const RULESET_NAME = 'Otea: protected base branches';

export type Ruleset = {
  name: string;
  target: 'branch';
  enforcement: 'active';
  conditions: { ref_name: { include: string[]; exclude: string[] } };
  rules: Array<{ type: string; parameters?: Record<string, unknown> }>;
};

export function rulesetFor(bases: readonly string[]): Ruleset {
  return {
    name: RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: bases.map((base) => `refs/heads/${base}`), exclude: [] } },
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
  };
}

// The steps to take by hand when gh cannot: on GitHub, or with gh once it is signed in.
export function forgeSteps(bases: readonly string[], why: string): string {
  const names = bases.join(', ');
  return [
    `${why}. To have GitHub enforce what Otea protects (${names}) for any tool:`,
    '  1. On GitHub, open the repository, then Settings > Rules > Rulesets > New ruleset > New branch ruleset.',
    `  2. Name it "${RULESET_NAME}" and set Enforcement status to Active.`,
    `  3. Under Target branches, Add target > Include by pattern: ${bases.join(', then ')}.`,
    '  4. Turn on Restrict deletions, Block force pushes, and Require a pull request before merging (0 required approvals).',
    '  5. Create.',
    'Or, once gh (https://cli.github.com) is installed and signed in (gh auth login) in a checkout of the GitHub repository, run otea hook install --forge again: it sets the ruleset for you.',
  ].join('\n');
}

function gh(path: string, cwd: string, args: string[], input?: string): string {
  return execFileSync(path, args, {
    cwd,
    encoding: 'utf8',
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    timeout: GH_TIMEOUT_MS,
    ...(input === undefined ? {} : { input }),
  }).trim();
}

// The real gh CLI at `path` ('gh' on the PATH); `prefix` goes before its arguments (a script a
// runtime runs, for a stand-in).
export function ghForge(path: string, prefix: readonly string[] = []): ForgeCli {
  const run = (cwd: string, args: string[], input?: string): string =>
    gh(path, cwd, [...prefix, ...args], input);
  return {
    status(cwd) {
      try {
        run(cwd, ['--version']);
      } catch {
        return 'missing';
      }
      try {
        run(cwd, ['auth', 'status']);
        return 'ready';
      } catch {
        return 'signed-out';
      }
    },
    repo(cwd) {
      try {
        const name = run(cwd, [
          'repo',
          'view',
          '--json',
          'nameWithOwner',
          '--jq',
          '.nameWithOwner',
        ]);
        return name === '' ? undefined : name;
      } catch {
        return undefined;
      }
    },
    rulesets(cwd, repo) {
      const listed: unknown = JSON.parse(run(cwd, ['api', `repos/${repo}/rulesets`]) || '[]');
      if (!Array.isArray(listed)) return [];
      return listed.flatMap((entry: { id?: unknown; name?: unknown }) =>
        typeof entry.id === 'number' && typeof entry.name === 'string'
          ? [{ id: entry.id, name: entry.name }]
          : [],
      );
    },
    saveRuleset(cwd, repo, ruleset, id) {
      const [method, endpoint] =
        id === undefined
          ? ['POST', `repos/${repo}/rulesets`]
          : ['PUT', `repos/${repo}/rulesets/${id}`];
      run(cwd, ['api', '-X', method, endpoint, '--input', '-'], JSON.stringify(ruleset));
    },
    deleteRuleset(cwd, repo, id) {
      run(cwd, ['api', '-X', 'DELETE', `repos/${repo}/rulesets/${id}`]);
    },
  };
}

// The GitHub repository of the checkout at cwd, once gh is there and signed in; else refuses with
// what to do by hand (`steps`, given why gh cannot).
function readyRepo(forge: ForgeCli, cwd: string, steps: (why: string) => string): string {
  const status = forge.status(cwd);
  const why =
    status === 'missing'
      ? 'gh, the GitHub CLI, is not installed'
      : status === 'signed-out'
        ? 'gh is not signed in (gh auth status)'
        : undefined;
  if (why) throw new CommandFailure('forge_unavailable', steps(why));
  const repo = forge.repo(cwd);
  if (repo === undefined)
    throw new CommandFailure(
      'forge_unavailable',
      steps(`gh finds no GitHub repository for ${cwd}`),
    );
  return repo;
}

function ghError(error: unknown): string {
  const stderr = (error as { stderr?: unknown }).stderr;
  const said = typeof stderr === 'string' ? stderr.trim() : '';
  return said || (error instanceof Error ? error.message : String(error));
}

// Sets the ruleset on the GitHub repository of the checkout at cwd, creating it or replacing
// Otea's own; refuses with the steps to take by hand when gh cannot.
export function installForge(cwd: string, bases: readonly string[], forge: ForgeCli): HookChange {
  if (bases.length === 0)
    throw new CommandFailure(
      'not_found',
      'No board protects a base branch, so there is nothing for the forge to enforce: in Studio, under the protected Rama, turn on «It protects the base branch too»',
    );
  const repo = readyRepo(forge, cwd, (why) => forgeSteps(bases, why));
  const ruleset = rulesetFor(bases);
  try {
    const kept = forge.rulesets(cwd, repo).find(({ name }) => name === RULESET_NAME);
    forge.saveRuleset(cwd, repo, ruleset, kept?.id);
    const path = `github.com/${repo}`;
    const note = `GitHub now refuses a direct push, a force push and a deletion of ${bases.join(', ')} from any tool: changes reach it through a pull request`;
    return {
      path,
      action: kept ? 'updated' : 'created',
      content: JSON.stringify(ruleset, null, 2),
      note,
      said: `${kept ? 'Updated' : 'Set'} the ruleset "${RULESET_NAME}" on ${path} (${note})`,
    };
  } catch (error) {
    throw new CommandFailure(
      'forge_unavailable',
      forgeSteps(bases, `gh could not set the ruleset on ${repo} (${ghError(error)})`),
    );
  }
}

// Takes Otea's ruleset off the GitHub repository of the checkout at cwd, leaving every other one.
export function removeForge(cwd: string, forge: ForgeCli): HookChange {
  const byHand = `delete the ruleset "${RULESET_NAME}" under Settings > Rules > Rulesets on GitHub`;
  const repo = readyRepo(forge, cwd, (why) => `${why}: ${byHand}`);
  const path = `github.com/${repo}`;
  try {
    const kept = forge.rulesets(cwd, repo).find(({ name }) => name === RULESET_NAME);
    if (!kept) return { path, action: 'absent', said: `${path} has no Otea ruleset` };
    forge.deleteRuleset(cwd, repo, kept.id);
    return { path, action: 'removed', said: `Removed the ruleset "${RULESET_NAME}" from ${path}` };
  } catch (error) {
    throw new CommandFailure(
      'forge_unavailable',
      `gh could not remove the ruleset on ${repo} (${ghError(error)}): ${byHand}`,
    );
  }
}
