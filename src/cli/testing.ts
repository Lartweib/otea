import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { openProject } from '../app/project.ts';
import { saveProfile } from '../store/queries.ts';
import type { Opener } from './opener.ts';
import { type Io, run } from './run.ts';

export type Result = { code: number; out: string; err: string };

export type Cli = (...argv: string[]) => Promise<Result>;

export function cliAt(
  cwd: string,
  env: Record<string, string> = {},
  signal = new AbortController().signal,
  openUrl: Opener = async () => {},
  ask?: (question: string) => Promise<string>,
  stdin?: string,
  // Whether stdout is a terminal a person reads (it is piped otherwise).
  terminal = false,
  // A fake tailscale CLI and network probe (otea phone), and a fake forge (gh); none by default.
  network: Pick<Io, 'tailscale' | 'probe' | 'forge'> = {},
): Cli {
  return async (...argv) => {
    let out = '';
    let err = '';
    const code = await run(argv, {
      cwd,
      env,
      signal,
      openUrl,
      ...network,
      ...(ask ? { ask } : {}),
      ...(stdin === undefined ? {} : { stdin: async () => stdin }),
      stdout: { write: (chunk: string) => (out += chunk), isTTY: terminal },
      stderr: { write: (chunk: string) => (err += chunk) },
    });
    return { code, out, err };
  };
}

export type Running = {
  out: () => string;
  err: () => string;
  done: Promise<number>;
  // Interrupts the command, as Ctrl+C does, and resolves with its exit code.
  stop: () => Promise<number>;
};

// Starts a long-running command (wait, events --follow) and lets the test read its output so far.
export function startCli(cwd: string, ...argv: string[]): Running {
  const interrupt = new AbortController();
  let out = '';
  let err = '';
  const done = run(argv, {
    cwd,
    env: { OTEA_AGENT: 'claude' },
    signal: interrupt.signal,
    openUrl: async () => {},
    stdout: { write: (chunk: string) => (out += chunk) },
    stderr: { write: (chunk: string) => (err += chunk) },
  });
  const stop = () => {
    interrupt.abort();
    return done;
  };
  return { out: () => out, err: () => err, done, stop };
}

// Resolves once `ready` holds, polling, or rejects after `timeoutMs`.
export async function until(ready: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

// Runs the CLI as a separate process, for tests that need real concurrent writers.
export function spawnCli(cwd: string, ...argv: string[]): Promise<Result> {
  return new Promise((resolve, reject) => {
    const args = ['--disable-warning=ExperimentalWarning', MAIN, ...argv];
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, OTEA_AGENT: 'claude' },
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });
}

export type TempRepo = {
  dir: string;
  write: (path: string, content: string) => void;
  remove: () => void;
};

export function tempGitRepo(): TempRepo {
  const dir = tempFolder();
  execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'ignore' });
  return tempRepoAt(dir);
}

const tempFolder = () => realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-cli-')));

// A process that just ended can hold the folder a moment longer on Windows.
const removeFolder = (dir: string) => rmSync(dir, { recursive: true, force: true, maxRetries: 10 });

function tempRepoAt(dir: string): TempRepo {
  return {
    dir,
    write: (path, content) => {
      const target = join(dir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    },
    remove: () => removeFolder(dir),
  };
}

// A repo with a local project (`init --local`, so all its data sits in the folder) seeded once by
// `seed`; `fresh` hands each test its own copy. Seeding through the CLI costs seconds on a loaded
// Windows runner, so a suite whose every test starts from the same items seeds them once.
export type SeededRepo = { fresh: () => TempRepo; remove: () => void };

export async function seededLocalRepo(seed: (dir: string) => Promise<void>): Promise<SeededRepo> {
  const template = tempGitRepo();
  await seed(template.dir);
  return {
    fresh: () => {
      const dir = tempFolder();
      cpSync(template.dir, dir, { recursive: true });
      return tempRepoAt(dir);
    },
    remove: template.remove,
  };
}

// Registers, for the enclosing describe block, one local project seeded once (`init --local`, then
// `seed`); `fresh` hands each test its own copy and a CLI on it, as the agent named claude. Suites
// whose every test starts from the same items use it instead of seeding through the CLI per test.
export function seedOnce(seed: (otea: Cli, dir: string) => Promise<void>): {
  fresh: () => { repo: TempRepo; otea: Cli };
} {
  const agent = { OTEA_AGENT: 'claude' };
  let seeded: SeededRepo | undefined;
  beforeAll(async () => {
    seeded = await seededLocalRepo(async (dir) => {
      const otea = cliAt(dir, agent);
      await otea('init', '--local');
      await seed(otea, dir);
    });
  });
  afterAll(() => seeded?.remove());
  return {
    fresh: () => {
      if (!seeded) throw new Error('seedOnce: the project is not seeded yet');
      const repo = seeded.fresh();
      return { repo, otea: cliAt(repo.dir, agent) };
    },
  };
}

// A checkout with a local project and the bare repo it pushes to, side by side in one temp folder,
// seeded once by `seed` for the enclosing describe block. `seed` gets the checkout (git init done)
// and the path of the bare repo (made, HEAD on main), and adds it as origin. `fresh` hands each test
// its own copy of the folder, origin pointing at the copy's bare repo, with an empty folder beside
// them (`aside`) for another clone. Suites whose every test starts from the same pushed branch seed
// it once: seeding it before each test took a loaded Windows runner past the hook's 30s.
export type CheckoutWithOrigin = { repo: TempRepo; origin: string; aside: string };

export function seedOnceWithOrigin(seed: (dir: string, origin: string) => Promise<void>): {
  fresh: () => CheckoutWithOrigin;
} {
  const layout = (root: string) => ({
    dir: join(root, 'checkout'),
    origin: join(root, 'origin.git'),
    aside: join(root, 'aside'),
  });
  let template: string | undefined;
  beforeAll(async () => {
    template = tempFolder();
    const { dir, origin, aside } = layout(template);
    mkdirSync(dir);
    mkdirSync(aside);
    execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['init', '--quiet', '--bare', origin], { stdio: 'ignore' });
    // A clone checks out main, whatever git's default branch name is where the test runs.
    execFileSync('git', ['--git-dir', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
    await seed(dir, origin);
  });
  afterAll(() => {
    if (template) removeFolder(template);
  });
  return {
    fresh: () => {
      if (!template) throw new Error('seedOnceWithOrigin: the checkout is not seeded yet');
      const root = tempFolder();
      cpSync(template, root, { recursive: true });
      const { dir, origin, aside } = layout(root);
      execFileSync('git', ['remote', 'set-url', 'origin', origin], { cwd: dir, stdio: 'ignore' });
      return { repo: { ...tempRepoAt(dir), remove: () => removeFolder(root) }, origin, aside };
    },
  };
}

// A collection on a preset, as projects made them before boards: the next command that opens the
// project reads it as a board, keeping the preset's states as its steps. Tests that stand on those
// states seed one this way; nothing in the CLI makes one any more.
export function presetCollection(cwd: string, name: string, preset = 'tasks'): void {
  const project = openProject(cwd);
  try {
    addCollection(project, { name, preset });
  } finally {
    project.db.close();
  }
}

// Agents with a declared profile, confirmed for their session, as `otea profile` leaves them: next
// and claim need one. Run after init.
export function declareProfiles(dir: string, ...agents: string[]): void {
  const project = openProject(dir);
  try {
    const profile = { harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high' };
    const at = new Date().toISOString();
    for (const agent of agents) {
      saveProfile(project.db, agent, profile, { at, channel: 'cli', confirmed: true });
    }
  } finally {
    project.db.close();
  }
}
