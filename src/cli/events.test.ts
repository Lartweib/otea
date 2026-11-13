import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Cli,
  cliAt,
  presetCollection,
  spawnCli,
  startCli,
  type TempRepo,
  tempGitRepo,
  until,
} from './testing.ts';

const AT = '\\d{4}-\\d\\d-\\d\\dT\\S+Z';

describe('events', () => {
  let repo: TempRepo;
  let otea: Cli;

  const lines = (text: string) => text.split('\n').filter(Boolean);
  const ndjson = async (...argv: string[]) =>
    lines((await otea('events', ...argv, '--json')).out).map((line) => JSON.parse(line));

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init');
    presetCollection(repo.dir, 'tasks');
    presetCollection(repo.dir, 'bugs');
    await otea('create', '--collection', 'tasks', '--title', 'First', '--description', 'D');
    await otea('create', '--collection', 'bugs', '--title', 'Crash', '--description', 'D');
    await otea('move', 'TASKS-1', 'todo__review');
  });

  afterEach(() => repo.remove());

  it('prints one line per event in commit order: id, item, time, actor, type, change', async () => {
    const { code, out } = await otea('events');

    expect(code).toBe(0);
    const [first, second, third, ...rest] = lines(out);
    expect(first).toMatch(new RegExp(`^1  TASKS-1  ${AT}  agent:agent  created  todo$`));
    expect(second).toMatch(new RegExp(`^2  BUGS-1  ${AT}  agent:agent  created  todo$`));
    expect(third).toMatch(
      /^3 {2}TASKS-1 {2}\S+ {2}agent:agent {2}transitioned {2}todo -> todo__review$/,
    );
    expect(rest).toEqual([]);
  });

  it('prints one JSON object per line with --json, shaped like the events of show', async () => {
    const events = await ndjson();
    const shown = JSON.parse((await otea('show', 'TASKS-1', '--json')).out).events;

    expect(events.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(events.filter(({ itemId }) => itemId === 'TASKS-1')).toEqual(shown);
  });

  it('prints only events after --since, capped by --limit', async () => {
    expect((await ndjson('--since', '1')).map(({ id }) => id)).toEqual([2, 3]);
    expect((await ndjson('--since', '1', '--limit', '1')).map(({ id }) => id)).toEqual([2]);
    expect(await ndjson('--since', '3')).toEqual([]);
  });

  it('filters by --item and --collection', async () => {
    expect((await ndjson('--item', 'TASKS-1')).map(({ id }) => id)).toEqual([1, 3]);
    expect((await ndjson('--collection', 'bugs')).map(({ id }) => id)).toEqual([2]);
  });

  it.each([
    ['--since', '-1'],
    ['--since', 'x'],
    ['--limit', '0'],
    ['--limit', '1.5'],
  ])('rejects %s %s as usage', async (name, value) => {
    const { code, err } = await otea('events', name, value);

    expect(code).toBe(2);
    expect(err).toContain('Usage: otea events');
  });

  it('rejects --limit with --follow as usage', async () => {
    const { code, err } = await otea('events', '--follow', '--limit', '5');

    expect(code).toBe(2);
    expect(err).toContain('--limit cannot be combined with --follow');
  });

  it('fails with not_found for an unknown item', async () => {
    expect((await otea('events', '--item', 'TASKS-9')).code).toBe(3);
  });

  describe('--follow', () => {
    it('keeps printing events other processes commit until interrupted, then exits 0', async () => {
      const follow = startCli(repo.dir, 'events', '--follow', '--since', '2', '--json');
      await until(() => lines(follow.out()).length === 1);

      // Relayed by an agent other than the one that handed TASKS-1 off.
      const relayed = ['TASKS-1', 'todo', '--quote', 'Again', '--reason', 'Again', '--as', 'codex'];
      await spawnCli(repo.dir, 'relay', ...relayed);
      await until(() => lines(follow.out()).length === 2);
      const code = await follow.stop();

      const events = lines(follow.out()).map((line) => JSON.parse(line));
      expect(code).toBe(0);
      expect(events.map(({ id, data }) => `${id} ${data.from} -> ${data.to}`)).toEqual([
        '3 todo -> todo__review',
        '4 todo__review -> todo',
      ]);
    });

    it('prints only events that match its filters', async () => {
      const follow = startCli(repo.dir, 'events', '--follow', '--collection', 'bugs');
      await until(() => lines(follow.out()).length === 1);

      await otea('relay', 'TASKS-1', 'todo', '--quote', 'Again', '--reason', 'R', '--as', 'codex');
      await otea('move', 'BUGS-1', 'todo__review');
      await until(() => lines(follow.out()).length === 2);
      await follow.stop();

      expect(lines(follow.out())[1]).toMatch(/^5 {2}BUGS-1 .* todo -> todo__review$/);
    });
  });
});
