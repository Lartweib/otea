import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Cli,
  cliAt,
  presetCollection,
  spawnCli,
  type TempRepo,
  tempGitRepo,
} from './testing.ts';

// Every text says a time one way: its UTC day and minute, named UTC.
const UTC = String.raw`\d{4}-\d\d-\d\d \d\d:\d\d UTC`;
const HELD = (holder: string) => new RegExp(`held by ${holder} until ${UTC}`);

describe('leases', () => {
  let repo: TempRepo;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    presetCollection(repo.dir, 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'First', '--description', 'D');
    await otea('create', '--collection', 'tasks', '--title', 'Second', '--description', 'D');
  });

  afterEach(() => repo.remove());

  describe('claim', () => {
    it('holds the item for the agent and prints it as a list row', async () => {
      const { code, out } = await otea('claim', 'TASKS-1', '--as', 'claude');

      expect(code).toBe(0);
      expect(out).toMatch(
        new RegExp(`^TASKS-1 {2}Hacerlo {2}agent {2}First {2}held by claude until ${UTC}\\n$`),
      );
    });

    it('prints the item with its lease with --json, 15 minutes by default', async () => {
      const item = await json('claim', 'TASKS-1', '--as', 'claude');
      const claimed = (await json('show', 'TASKS-1')).events.at(-1);

      expect(item.lease.holder).toBe('claude');
      expect(Date.parse(item.lease.expiresAt) - Date.parse(claimed.at)).toBe(15 * 60_000);
      expect(claimed).toMatchObject({
        type: 'claimed',
        actor: { kind: 'agent', name: 'claude' },
        data: { holder: 'claude', expiresAt: item.lease.expiresAt },
      });
    });

    it('accepts --ttl', async () => {
      const item = await json('claim', 'TASKS-1', '--ttl', '90s');
      const claimed = (await json('show', 'TASKS-1')).events.at(-1);

      expect(Date.parse(item.lease.expiresAt) - Date.parse(claimed.at)).toBe(90_000);
    });

    it.each(['0m', '15', 'soon'])('rejects --ttl %s as usage', async (ttl) => {
      const { code, err } = await otea('claim', 'TASKS-1', '--ttl', ttl);

      expect(code).toBe(2);
      expect(err).toContain('--ttl must be a positive duration such as 90s, 15m or 1h');
      expect(err).toContain('Usage: otea claim <id> [--ttl <duration>]');
    });

    it('fails with lease_held (exit 12) naming the holder when someone else holds it', async () => {
      await otea('claim', 'TASKS-1', '--as', 'claude');

      const { code, err } = await otea('claim', 'TASKS-1', '--as', 'codex', '--json');

      expect(code).toBe(12);
      expect(JSON.parse(err).error).toMatchObject({ code: 'lease_held' });
      expect(JSON.parse(err).error.message).toMatch(
        new RegExp(`^TASKS-1 is held by claude until ${UTC}$`),
      );
    });

    it('fails with not_claimable (exit 4) when the turn is not the agent', async () => {
      await otea('handoff', 'TASKS-1');

      const { code, err } = await otea('claim', 'TASKS-1');

      expect(code).toBe(4);
      expect(err).toContain(
        'TASKS-1 is in the review of Hacerlo (turn human); only items on the agent turn can be claimed',
      );
    });

    it('lets exactly one of two agents claiming concurrently win', async () => {
      const results = await Promise.all([
        spawnCli(repo.dir, 'claim', 'TASKS-1', '--as', 'claude-a', '--json'),
        spawnCli(repo.dir, 'claim', 'TASKS-1', '--as', 'claude-b', '--json'),
      ]);

      const codes = results.map(({ code }) => code).sort();
      expect(codes).toEqual([0, 12]);
      const winner = results.find(({ code }) => code === 0);
      const { lease, events } = await json('show', 'TASKS-1');
      expect(lease.holder).toBe(JSON.parse(winner?.out ?? '{}').lease.holder);
      expect(events.filter(({ type }: { type: string }) => type === 'claimed')).toHaveLength(1);
    }, 30_000);
  });

  describe('heartbeat', () => {
    beforeEach(async () => {
      await otea('claim', 'TASKS-1', '--as', 'claude', '--ttl', '1m');
    });

    it('extends the lease of the holder without adding to the timeline', async () => {
      const before = await json('show', 'TASKS-1');

      const item = await json('heartbeat', 'TASKS-1', '--as', 'claude', '--ttl', '1h');

      expect(Date.parse(item.lease.expiresAt)).toBeGreaterThan(Date.parse(before.lease.expiresAt));
      expect((await json('show', 'TASKS-1')).events).toHaveLength(before.events.length);
    });

    it('fails with not_lease_holder (exit 12) for another agent', async () => {
      const { code, err } = await otea('heartbeat', 'TASKS-1', '--as', 'codex', '--json');

      expect(code).toBe(12);
      expect(JSON.parse(err).error).toEqual({
        code: 'not_lease_holder',
        message: expect.stringMatching(
          new RegExp(
            `^TASKS-1 is held by claude until ${UTC}, not by codex: only claude can renew or release it$`,
          ),
        ),
      });
    });
  });

  describe('release', () => {
    beforeEach(async () => {
      await otea('claim', 'TASKS-1', '--as', 'claude');
    });

    it('drops the lease and shows the release in the timeline', async () => {
      expect(await otea('release', 'TASKS-1', '--as', 'claude')).toMatchObject({
        code: 0,
        out: 'TASKS-1  Hacerlo  agent  First\n',
      });
      expect((await json('show', 'TASKS-1')).lease).toBeNull();
      expect((await otea('show', 'TASKS-1')).out).toMatch(/released +claude \(released\)$/m);
    });

    it('fails with not_lease_holder (exit 12) when the caller does not hold it', async () => {
      const { code, err } = await otea('release', 'TASKS-1', '--as', 'codex', '--json');

      expect(code).toBe(12);
      expect(JSON.parse(err).error.code).toBe('not_lease_holder');
    });
  });

  describe('a held item', () => {
    beforeEach(async () => {
      await otea('claim', 'TASKS-1', '--as', 'claude');
    });

    it('refuses moves and updates by another agent with exit 12', async () => {
      expect((await otea('move', 'TASKS-1', 'todo__review', '--as', 'codex')).code).toBe(12);
      expect((await otea('handoff', 'TASKS-1', '--as', 'codex')).code).toBe(12);
      expect((await otea('update', 'TASKS-1', '--title', 'X', '--as', 'codex')).code).toBe(12);
      expect((await json('show', 'TASKS-1')).state).toBe('todo');
    });

    it('stays writable for the holder', async () => {
      expect((await otea('update', 'TASKS-1', '--title', 'Mine', '--as', 'claude')).code).toBe(0);
      expect((await otea('handoff', 'TASKS-1', '--as', 'claude')).code).toBe(0);
    });

    it('is released when the holder moves it to review', async () => {
      const { out } = await otea('move', 'TASKS-1', 'todo__review', '--as', 'claude');

      expect(out).toBe('TASKS-1  Hacerlo (in review)  human  First\n');
      expect((await otea('show', 'TASKS-1')).out).toMatch(/released +claude \(handed off\)$/m);
    });

    it('is shown with its holder in list and show', async () => {
      const lines = (await otea('list')).out.split('\n');

      expect(lines[0]).toMatch(HELD('claude'));
      expect(lines[1]).not.toContain('held by');
      expect((await json('list')).map(({ lease }: { lease: unknown }) => lease)).toEqual([
        { holder: 'claude', expiresAt: expect.any(String) },
        null,
      ]);
      const shown = (await otea('show', 'TASKS-1')).out;
      expect(shown).toMatch(/^state: Hacerlo {2}turn: agent {2}collection: tasks\nheld by claude/m);
      expect(shown).toMatch(
        new RegExp(`^ +${UTC} +agent:claude +claimed +claude until ${UTC}$`, 'm'),
      );
      expect(shown).toMatch(new RegExp(`^created by agent:claude via cli at ${UTC}$`, 'm'));
      expect((await json('show', 'TASKS-2')).lease).toBeNull();
    });

    it('is hidden from others by list --unclaimed', async () => {
      const ids = async (as: string) =>
        (await json('list', '--unclaimed', '--as', as)).map(({ id }: { id: string }) => id);

      expect(await ids('codex')).toEqual(['TASKS-2']);
      expect(await ids('claude')).toEqual(['TASKS-1', 'TASKS-2']);
    });
  });
});
