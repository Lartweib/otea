import { spawn } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createItem } from '../app/items.ts';
import { approveItem, sendBackItem } from '../app/next.ts';
import { listAgents, processAlive, sessionEnded } from '../app/presence.ts';
import { openProject } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { cambios, errores, step, tareasDeRepo } from '../core/board/testing.ts';
import { selectProcessBeats, updateItemState } from '../store/queries.ts';
import { listProcesses, ownerChain, type ProcessRow } from './owner.ts';
import {
  type Cli,
  declareProfiles,
  presetCollection,
  seedOnce,
  spawnCli,
  startCli,
  type TempRepo,
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

  // Seeded once and copied for each test: seeding through the CLI before every one of them cost a
  // loaded Windows runner up to 30s, past the hook's budget.
  const seeded = seedOnce(async (cli, dir) => {
    declareProfiles(dir, 'claude', 'claude-a', 'claude-b', 'codex', 'gemini', 'quill');
    presetCollection(dir, 'tasks');
    presetCollection(dir, 'bugs');
    await cli('create', '--collection', 'tasks', '--title', 'First', '--description', 'D');
    await cli('create', '--collection', 'tasks', '--title', 'Second', '--description', 'D');
  });

  beforeEach(() => {
    ({ repo, otea } = seeded.fresh());
  });

  afterEach(() => repo.remove());

  it('returns at once the item waiting longest on the turn, as a list row', async () => {
    await otea('move', 'TASKS-1', 'todo__review');

    const { code, out } = await otea('wait', '--turn', 'agent');

    expect(code).toBe(0);
    expect(out).toBe(
      'TASKS-2  Hacerlo  agent  Second\nThen keep going: otea next --as claude; when it has nothing, otea wait --turn agent --unclaimed --as claude in the background if you can.\n',
    );
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
      expect(quill).toMatchObject({ listening: true, live: true, waiting: true });
    } finally {
      project.db.close();
      await waiting.stop();
    }
  });

  it('stops counting the agent as waiting once its wait found an item', async () => {
    const { code } = await otea('wait', '--turn', 'agent', '--as', 'quill');
    expect(code).toBe(0);

    const project = openProject(repo.dir);
    try {
      const quill = listAgents(project.db).find(({ name }) => name === 'quill');
      expect(quill).toMatchObject({ listening: true, waiting: false });
      // P3C-R3-12: it said it ended, so a process given its id later is never taken for it. (The
      // command ran in this process.)
      expect(selectProcessBeats(project.db).has(process.pid)).toBe(false);
    } finally {
      project.db.close();
    }
  });

  it('wakes an agent only for an item next would offer it, not one just offered to another', async () => {
    await otea('next', '--as', 'codex');

    const { code, out } = await otea('wait', '--turn', 'agent', '--unclaimed', '--as', 'gemini');

    expect(code).toBe(0);
    expect(out.split('\n')[0]).toBe('TASKS-2  Hacerlo  agent  Second');
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
      expect(waiting.out()).toMatch(/^TASKS-1 {2}Hacerlo {2}agent {2}First\nThen keep going: /);
    });
  });

  // P4-R2-1: an agent whose own question waits for the person still hears the rest of its work.
  describe('while its own question waits for the person', () => {
    const sendBack = (id: string) => {
      const project = openProject(repo.dir);
      try {
        sendBackItem(project, {
          id,
          actor: { kind: 'human', name: 'human' },
          channel: 'ui',
          reason: 'Más corto',
        });
      } finally {
        project.db.close();
      }
    };
    const waitForWork = () =>
      otea('wait', '--turn', 'agent', '--unclaimed', '--as', 'claude', '--timeout', '5s');

    it('wakes for a send-back of an item it handed off', async () => {
      await otea('claim', 'TASKS-1');
      await otea('handoff', 'TASKS-1');
      await otea('claim', 'TASKS-2');
      await otea('ask', 'TASKS-2', '¿Azul o verde?');
      sendBack('TASKS-1');

      const { code, out } = await waitForWork();

      expect(code).toBe(0);
      expect(out).toMatch(/^TASKS-1 {2}Hacerlo {2}agent {2}First\n/);
    });

    it('wakes for a send-back of its work that came before it asked', async () => {
      await otea('claim', 'TASKS-1');
      await otea('handoff', 'TASKS-1');
      sendBack('TASKS-1');
      await otea('claim', 'TASKS-2');
      await otea('ask', 'TASKS-2', '¿Azul o verde?');

      const { code, out } = await waitForWork();

      expect(code).toBe(0);
      expect(out).toMatch(/^TASKS-1 /);
    });

    it('wakes for work that arrives after it asked, not for the item it asked about', async () => {
      await otea('claim', 'TASKS-2');
      await otea('ask', 'TASKS-2', '¿Azul o verde?');
      await otea('create', '--collection', 'tasks', '--title', 'Third', '--description', 'D');

      const { code, out } = await waitForWork();

      expect(code).toBe(0);
      expect(out).toMatch(/^TASKS-3 /);
    });

    it('does not wake for its sent-back item while it asks the person about it', async () => {
      await otea('claim', 'TASKS-1');
      await otea('handoff', 'TASKS-1');
      sendBack('TASKS-1');
      await otea('claim', 'TASKS-1');
      await otea('ask', 'TASKS-1', '¿Cuánto más corto?');

      const { code, err } = await otea('wait', '--turn', 'agent', '--timeout', '1s');

      expect(code).toBe(13);
      expect(err).toContain('your question on TASKS-1');
    });
  });

  // P2S-6, P3C-15, P6-R2-9: what the person does on the desk reaches a waiting agent, with the
  // action it now has to take.
  describe('after the person acts on the desk', () => {
    // A Cambio divides into Tareas de repo; a Tarea ends with Integrar, which an agent does.
    const repoBoards = (land: boolean) => {
      const project = openProject(repo.dir);
      try {
        const tasks = tareasDeRepo();
        if (land) tasks.steps.push(step('sland', 'Integrar', { reviewer: 'none' }));
        publishAs(project, tasks, 'brt');
        publishAs(project, cambios(), 'bcam');
        const parent = createItem(project, {
          collection: 'Cambios',
          title: 'Nube',
          fields: { fwhat: 'x' },
          actor: { kind: 'human', name: 'human' },
        });
        const task = createItem(project, {
          collection: 'Tareas de repo',
          title: 'API',
          fields: { frepo: 'api', fbranch: 'feat/x' },
          parent: parent.id,
          actor: { kind: 'human', name: 'human' },
        });
        return { parent: parent.id, task: task.id };
      } finally {
        project.db.close();
      }
    };
    const inState = (id: string, state: string) => {
      const project = openProject(repo.dir);
      try {
        updateItemState(project.db, id, state, new Date().toISOString());
      } finally {
        project.db.close();
      }
    };

    it('wakes when an approval hands the item on to a step an agent does', async () => {
      const { task } = repoBoards(true);
      inState(task, 'simpl__review');
      const args = ['--turn', 'agent', '--unclaimed', '--collection', 'Tareas de repo'];
      const waiting = startCli(repo.dir, 'wait', ...args, '--as', 'claude');
      expect(await settled(waiting)).toBe(false);

      const project = openProject(repo.dir);
      try {
        approveItem(project, { id: task, actor: { kind: 'human', name: 'human' }, channel: 'ui' });
      } finally {
        project.db.close();
      }

      expect(await waiting.done).toBe(0);
      expect(waiting.out()).toMatch(new RegExp(`^${task} {2}Integrar {2}agent {2}API\\n`));
    });

    it('names the merges to make first when it wakes for a parent that waits for them', async () => {
      const { parent, task } = repoBoards(false);
      inState(task, 'done');
      inState(parent, 'sexec');

      const { code, out } = await otea(
        'wait',
        '--turn',
        'agent',
        '--unclaimed',
        '--collection',
        'Cambios',
        '--as',
        'claude',
      );

      expect(code).toBe(0);
      expect(out).toContain(
        [
          `Merge first: ${parent} waits for its parts to be merged.`,
          '',
          'Waiting to be merged',
          `  ${task} (feat/x) is Done: merge its PR, then otea merged ${task} --pr <url>.`,
        ].join('\n'),
      );
    });
  });

  // P3C-R2-4: an item the person wants for later no longer wakes the agent's wait at once.
  it('leaves out an item the agent set aside with release --later, until it takes it up again', async () => {
    await otea('claim', 'TASKS-2', '--as', 'codex');
    await otea('claim', 'TASKS-1');
    const released = await otea('release', 'TASKS-1', '--later');
    expect(released.code).toBe(0);
    expect(released.out).toContain('Set TASKS-1 aside');

    const waited = await otea('wait', '--turn', 'agent', '--unclaimed', '--timeout', '1s');
    expect(waited.code).toBe(13);
    const next = await otea('next');
    expect(next.out).toContain('Nothing to do');
    expect(next.out).toContain(
      'You set aside TASKS-1 for later: otea claim TASKS-1 takes it up again.',
    );
    // It is the person's wish, so another agent leaves it too (P7-R3-6), and is told who set it aside.
    const other = ['wait', '--turn', 'agent', '--unclaimed', '--as', 'gemini', '--timeout', '1s'];
    expect((await otea(...other)).code).toBe(13);
    expect((await otea('next', '--as', 'gemini')).out).toContain(
      'claude set aside TASKS-1 for later: otea claim TASKS-1 takes it up again.',
    );

    await otea('claim', 'TASKS-1');
    await otea('release', 'TASKS-1');
    expect((await otea('wait', '--turn', 'agent', '--unclaimed')).out).toMatch(/^TASKS-1 /);
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
      // P3C-R3-11: its session reads as ended, so an answer is not claimed for it, and another
      // agent's claim takes over what it held.
      const project = openProject(repo.dir);
      try {
        expect(sessionEnded(project.db, 'claude')).toBe(true);
      } finally {
        project.db.close();
      }
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
