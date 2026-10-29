import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Cli,
  cliAt,
  spawnCli,
  startCli,
  type TempRepo,
  tempGitRepo,
  until,
} from './testing.ts';

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
    await otea('collection', 'add', 'tasks');
    await otea('collection', 'add', 'bugs');
    await otea('create', '--collection', 'tasks', '--title', 'First', '--description', 'D');
    await otea('create', '--collection', 'tasks', '--title', 'Second', '--description', 'D');
  });

  afterEach(() => repo.remove());

  it('returns at once the item waiting longest on the turn, as a list row', async () => {
    await otea('move', 'TASKS-1', 'in_progress');

    const { code, out } = await otea('wait', '--turn', 'agent');

    expect(code).toBe(0);
    expect(out).toBe('TASKS-2  todo  agent  Second\n');
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

    await spawnCli(repo.dir, 'move', 'TASKS-2', 'in_progress');
    await spawnCli(repo.dir, 'move', 'TASKS-2', 'review');

    expect(await waiting.done).toBe(0);
    expect(waiting.out()).toBe('TASKS-2  review  human  Second\n');
  });

  it('keeps waiting while the only matches are in another collection', async () => {
    const waiting = startCli(repo.dir, 'wait', '--turn', 'agent', '--collection', 'bugs');
    expect(await settled(waiting)).toBe(false);

    await otea('create', '--collection', 'bugs', '--title', 'Crash', '--description', 'D');

    expect(await waiting.done).toBe(0);
    expect(waiting.out()).toMatch(/^BUGS-1 {2}todo/);
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
      await otea('claim', 'TASKS-1', '--as', 'codex', '--ttl', '1s');
      await otea('claim', 'TASKS-2', '--as', 'codex', '--ttl', '1s');
      const waiting = startCli(repo.dir, 'wait', '--turn', 'agent', '--unclaimed', '--as', 'x');
      expect(await settled(waiting)).toBe(false);

      await until(() => waiting.out() !== '', 4000);

      expect(await waiting.done).toBe(0);
      expect(waiting.out()).toMatch(/^TASKS-1 {2}todo {2}agent {2}First\n$/);
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
