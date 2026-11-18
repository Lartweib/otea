import { spawn } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAgents, processAlive } from '../app/presence.ts';
import { openProject } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { errores } from '../core/board/testing.ts';
import { listProcesses, ownerChain, type ProcessRow } from './owner.ts';
import {
  type Cli,
  cliAt,
  declareProfiles,
  presetCollection,
  spawnCli,
  startCli,
  type TempRepo,
  tempGitRepo,
  until,
} from './testing.ts';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

// Whether no process holds the folder any more: it can be renamed, and is put back.
function released(dir: string): boolean {
  try {
    renameSync(dir, `${dir}-released`);
    renameSync(`${dir}-released`, dir);
    return true;
  } catch {
    return false;
  }
}
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';

const USAGE =
  'Usage: otea wait --turn <agent|human> [--collection <collection>] [--unclaimed] [--timeout <duration>]';

describe('wait', () => {
  let repo: TempRepo;
  let otea: Cli;

  const settled = async (running: { done: Promise<number> }) =>
    Promise.race([running.done.then(() => true), delay(400).then(() => false)]);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    declareProfiles(repo.dir, 'claude', 'claude-a', 'claude-b', 'codex', 'gemini', 'quill');
    presetCollection(repo.dir, 'tasks');
    presetCollection(repo.dir, 'bugs');
    await otea('create', '--collection', 'tasks', '--title', 'First', '--description', 'D');
    await otea('create', '--collection', 'tasks', '--title', 'Second', '--description', 'D');
  });

  afterEach(() => repo.remove());

  it('returns at once the item waiting longest on the turn, as a list row', async () => {
    await otea('move', 'TASKS-1', 'todo__review');

    const { code, out } = await otea('wait', '--turn', 'agent');

    expect(code).toBe(0);
    expect(out).toBe('TASKS-2  Hacerlo  agent  Second\n');
  });

  it('prints the item like an entry of list --json with --json', async () => {
    const { code, out } = await otea('wait', '--turn', 'agent', '--json');
    const listed = JSON.parse((await otea('list', '--json')).out);

    expect(code).toBe(0);
    expect(JSON.parse(out)).toEqual(listed[0]);
  });

  it('blocks until another process moves an item into the turn', async () => {
    const waiting = startCli(repo.dir, 'wait', '--turn', 'human', '--collection', 'tasks');
    expect(await settled(waiting)).toBe(false);

    // Only the move that reaches the turn needs another process; each one boots Node.
    await spawnCli(repo.dir, 'move', 'TASKS-2', 'todo__review');

    expect(await waiting.done).toBe(0);
    expect(waiting.out()).toBe('TASKS-2  Hacerlo (en revisión)  human  Second\n');
  });

  it('counts the waiting agent as listening from the start of its wait', async () => {
    const waiting = startCli(repo.dir, 'wait', '--turn', 'human', '--as', 'quill');
    expect(await settled(waiting)).toBe(false);

    const project = openProject(repo.dir);
    try {
      const quill = listAgents(project.db).find(({ name }) => name === 'quill');
      expect(quill).toMatchObject({ listening: true, live: true });
    } finally {
      project.db.close();
      await waiting.stop();
    }
  });

  it('wakes an agent only for an item next would offer it, not one just offered to another', async () => {
    await otea('next', '--as', 'codex');

    const { code, out } = await otea('wait', '--turn', 'agent', '--unclaimed', '--as', 'gemini');

    expect(code).toBe(0);
    expect(out).toBe('TASKS-2  Hacerlo  agent  Second\n');
  });

  it('keeps waiting while the only matches are in another collection', async () => {
    const waiting = startCli(repo.dir, 'wait', '--turn', 'agent', '--collection', 'bugs');
    expect(await settled(waiting)).toBe(false);

    await otea('create', '--collection', 'bugs', '--title', 'Crash', '--description', 'D');

    expect(await waiting.done).toBe(0);
    expect(waiting.out()).toMatch(/^BUGS-1 {2}Hacerlo/);
  });

  it('keeps waiting while the person publishes a board, and wakes for an item on it', async () => {
    const waiting = startCli(repo.dir, 'wait', '--turn', 'human');
    expect(await settled(waiting)).toBe(false);

    // Studio publishes from the server's own process; the wait only sees the new board's rows.
    const project = openProject(repo.dir);
    try {
      publishAs(project, errores(), 'berr');
    } finally {
      project.db.close();
    }
    expect(await settled(waiting)).toBe(false);
    await otea('create', '--collection', 'Errores', '--title', 'Faro', '--field', 'Pasos=abrir');

    expect(await waiting.done).toBe(0);
    expect(waiting.err()).toBe('');
    expect(waiting.out()).toBe('BUG-1  Triar  human  Faro\n');
  });

  describe('--unclaimed', () => {
    it('skips items another agent holds', async () => {
      await otea('claim', 'TASKS-1', '--as', 'codex');

      expect((await otea('wait', '--turn', 'agent', '--unclaimed')).out).toMatch(/^TASKS-2 /);
      expect((await otea('wait', '--turn', 'agent')).out).toMatch(/^TASKS-1 /);
      expect((await otea('wait', '--turn', 'agent', '--unclaimed', '--as', 'codex')).out).toMatch(
        /^TASKS-1 /,
      );
    });

    it('returns an item once the lease on it expires, though nothing is written', async () => {
      // TASKS-2 stays held, and TASKS-1 is claimed last with room for a slow start: a 1s lease
      // could run out before the wait even begins, which a loaded machine did.
      await otea('claim', 'TASKS-2', '--as', 'codex');
      await otea('claim', 'TASKS-1', '--as', 'codex', '--ttl', '3s');
      const waiting = startCli(repo.dir, 'wait', '--turn', 'agent', '--unclaimed', '--as', 'x');
      expect(await settled(waiting)).toBe(false);

      await until(() => waiting.out() !== '', 8000);

      expect(await waiting.done).toBe(0);
      expect(waiting.out()).toMatch(/^TASKS-1 {2}Hacerlo {2}agent {2}First\n$/);
    });
  });

  it('fails with timeout (exit 13) when nothing reaches the turn in time', async () => {
    const started = Date.now();
    const { code, out, err } = await otea('wait', '--turn', 'human', '--timeout', '1s', '--json');

    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    expect(code).toBe(13);
    expect(out).toBe('');
    expect(JSON.parse(err).error).toEqual({
      code: 'timeout',
      message: 'No item reached the human turn within 1s',
    });
  });

  it('stops waiting once the process that started it is gone, so its agent no longer reads as listening', async () => {
    // A parent that starts the wait in the background and stays, as a harness session would, until
    // the test ends it. Detached: on Windows a child that is not dies with its parent anyway.
    const starter = [
      "const c = require('node:child_process').spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'ignore' });",
      'c.unref();',
      'console.log(c.pid);',
      'setTimeout(() => {}, 60_000);',
    ].join(' ');
    const parent = spawn(
      process.execPath,
      [
        '-e',
        starter,
        '--disable-warning=ExperimentalWarning',
        MAIN,
        'wait',
        '--turn',
        'human',
        '--collection',
        'tasks',
        '--timeout',
        '1m',
      ],
      {
        cwd: repo.dir,
        env: { ...process.env, OTEA_AGENT: 'claude' },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    const pid = await new Promise<number>((resolve) =>
      parent.stdout
        .setEncoding('utf8')
        .once('data', (line: string) => resolve(Number(line.trim()))),
    );
    const listening = () => {
      const project = openProject(repo.dir);
      try {
        return listAgents(project.db).some(({ name, listening }) => name === 'claude' && listening);
      } finally {
        project.db.close();
      }
    };
    try {
      // The wait has started, heard as listening, while its parent still runs.
      await until(listening, 15_000);
      parent.kill();
      await until(() => !processAlive(pid), 15_000);
      // At once, not a listening window later.
      expect(listening()).toBe(false);
    } finally {
      parent.kill();
      if (processAlive(pid)) process.kill(pid);
      // Windows holds the folder of processes that just ended a moment longer, under load longer
      // than the cleanup retries: wait until it lets go.
      await until(() => released(repo.dir), 20_000);
    }
  });

  // Claude Code on Windows: its session runs Git's bash, which forks a copy that becomes the npm sh
  // shim and ends at once, and the shim stays as node's stub. The session ending leaves bash and
  // the shim running: only MSYS still links the shim to the bash, and the bash to the session.
  it.runIf(process.platform === 'win32' && existsSync(GIT_BASH))(
    'stops waiting once the session that ran it through Git Bash and the npm shim is gone',
    async () => {
      const slash = (path: string) => path.replaceAll('\\', '/');
      const shim = join(repo.dir, 'otea-shim');
      // The shim notes its Windows id, which stays as node's stub.
      const shimPid = join(repo.dir, 'shim-pid');
      writeFileSync(
        shim,
        `#!/bin/sh\ncat /proc/$$/winpid > "${slash(shimPid)}"\nexec "${slash(process.execPath)}" --disable-warning=ExperimentalWarning "${slash(MAIN)}" "$@"\n`,
      );
      const done = join(repo.dir, 'wait-ended');
      // Only the subshell that runs the wait stands in the project folder, so none holds it after.
      const command = `(cd "${slash(repo.dir)}" && "${slash(shim)}" wait --turn human --collection tasks --timeout 2m); echo $? > "${slash(done)}"`;
      // The session: it starts bash and stays until the test ends it. Detached, bash outlives it,
      // as it outlives a Claude Code session.
      const starter = [
        "const c = require('node:child_process').spawn(process.argv[1], ['-c', process.argv[2]], { detached: true, stdio: 'ignore', windowsHide: true });",
        'c.unref();',
        "console.log('up');",
        'setTimeout(() => {}, 120_000);',
      ].join(' ');
      const session = spawn(process.execPath, ['-e', starter, GIT_BASH, command], {
        cwd: tmpdir(),
        env: { ...process.env, OTEA_AGENT: 'claude' },
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      await new Promise((resolve) => session.stdout.once('data', resolve));
      const listening = () => {
        const project = openProject(repo.dir);
        try {
          return listAgents(project.db).some(
            ({ name, listening }) => name === 'claude' && listening,
          );
        } finally {
          project.db.close();
        }
      };
      let wait: ProcessRow | undefined;
      try {
        await until(listening, 30_000);
        // The processes as the wait reads them: the session is above it.
        const signal = new AbortController().signal;
        const stub = Number(readFileSync(shimPid, 'utf8').trim());
        // As Windows lists them (from this process, no shell), node runs under the shim's stub.
        wait = (await listProcesses(signal, process.pid))?.rows.find(
          ({ parent }) => parent === stub,
        );
        expect(wait, 'the wait runs under the sh shim').toBeDefined();
        const table = await listProcesses(signal, stub);
        expect(table?.complete).toBe(true);
        expect(ownerChain(table?.rows ?? [], stub, true)).toContain(session.pid);
        expect(existsSync(done)).toBe(false);
        session.kill();
        await until(() => existsSync(done), 60_000);
      } finally {
        session.kill();
        if (wait && processAlive(wait.pid)) process.kill(wait.pid);
      }
    },
    150_000,
  );

  it('exits 130 without printing an item when interrupted', async () => {
    const waiting = startCli(repo.dir, 'wait', '--turn', 'human');
    expect(await settled(waiting)).toBe(false);

    expect(await waiting.stop()).toBe(130);
    expect(waiting.out()).toBe('');
    expect(waiting.err()).toBe('otea: Interrupted while waiting\n');
  });

  it.each([
    [['--turn', 'none'], '--turn must be one of agent, human'],
    [['--turn', 'robot'], '--turn must be one of agent, human'],
    [[], 'Missing --turn for "otea wait"'],
    [['--turn', 'agent', '--timeout', '10'], '--timeout must be a positive duration'],
  ])('rejects %j as usage', async (argv, message) => {
    const { code, err } = await otea('wait', ...argv);

    expect(code).toBe(2);
    expect(err).toContain(message);
    expect(err).toContain(USAGE);
  });
});
