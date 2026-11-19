import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { findAgent, markMcpAsked } from '../store/queries.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, listItems } from './items.ts';
import { claimItem, releaseItem } from './leases.ts';
import {
  CLI_HARNESS,
  claimName,
  endListening,
  endWaiting,
  hearAgent,
  listAgents,
  nameFor,
  offerName,
  ownerGone,
  presenceSignature,
  seeAgent,
  waitBeat,
} from './presence.ts';
import { declareProfile } from './profile.ts';
import { memoryContext } from './testing.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const claude: Actor = { kind: 'agent', name: 'claude' };

const T0 = '2026-01-01T00:00:00.000Z';
const T0_20S = '2026-01-01T00:00:20.000Z';
const T1 = '2026-01-01T00:01:00.000Z';
const T5 = '2026-01-01T00:05:00.000Z';
const T5_1S = '2026-01-01T00:05:01.000Z';
const T2 = '2026-01-01T00:02:00.000Z';
const T2_31S = '2026-01-01T00:02:31.000Z';
const T30 = '2026-01-01T00:30:00.000Z';

const at = (time: string) => () => time;

const CLAUDE_CODE = { name: 'claude-code', version: '2.1.0' };

describe('agent presence', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext();
  });

  afterEach(() => ctx.db.close());

  describe('seeAgent', () => {
    it('records the harness an MCP client names and when the agent was seen', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));

      expect(findAgent(ctx.db, 'claude')).toEqual({
        name: 'claude',
        harness: 'claude-code',
        harnessVersion: '2.1.0',
        lastSeen: T0,
        connectedAt: T0,
        // Heard through the MCP server: its harness loaded Otea's server.
        mcpAt: T0,
        mcpAskedAt: null,
        folder: null,
      });
    });

    it('bumps the last-seen time on a later sighting', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T1));

      expect(findAgent(ctx.db, 'claude')?.lastSeen).toBe(T1);
    });

    it('writes nothing when seen again within half a minute with the same harness', () => {
      const sighting = { agent: 'claude', channel: 'mcp' as const, harness: CLAUDE_CODE };
      expect(seeAgent(ctx.db, sighting, at(T0))).toBe(true);

      expect(seeAgent(ctx.db, sighting, at(T0_20S))).toBe(false);
      expect(findAgent(ctx.db, 'claude')?.lastSeen).toBe(T0);
    });

    it('writes at once when the harness changes', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));
      const codex = { name: 'codex', version: '1.0.0' };

      expect(
        seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: codex }, at(T0_20S)),
      ).toBe(true);
      expect(findAgent(ctx.db, 'claude')).toMatchObject({ harness: 'codex', lastSeen: T0_20S });
    });

    it('names the cli as the harness of an agent only seen at the command line', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli', harness: CLI_HARNESS }, at(T0));

      expect(findAgent(ctx.db, 'claude')).toMatchObject({ harness: 'cli', harnessVersion: null });
    });

    it('keeps the MCP client of an agent that also runs the cli', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli', harness: CLI_HARNESS }, at(T1));

      expect(findAgent(ctx.db, 'claude')).toMatchObject({ harness: 'claude-code', lastSeen: T1 });
    });

    it('lets an MCP client replace the cli', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli', harness: CLI_HARNESS }, at(T0));
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T1));

      expect(findAgent(ctx.db, 'claude')?.harness).toBe('claude-code');
    });

    it('keeps the known harness when an MCP client names none', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp' }, at(T1));

      expect(findAgent(ctx.db, 'claude')).toMatchObject({ harness: 'claude-code', lastSeen: T1 });
    });
  });

  describe('listAgents', () => {
    beforeEach(() => {
      addCollection(ctx, { name: 'tasks' });
      const task = { collection: 'tasks', fields: { description: 'Details' }, actor: ana };
      createItem(ctx, { ...task, title: 'First' }, at(T0));
      createItem(ctx, { ...task, title: 'Second' }, at(T0));
    });

    it('lists no one before an agent is seen, and never the human', () => {
      expect(listAgents(ctx.db, at(T0))).toEqual([]);
    });

    // A command-line agent at work between its commands: connected, so the desk never says nobody
    // is there while it delivers (P1-11), but never listening; gone once it stops acting.
    it('counts an agent that acted lately as connected, never as listening', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli' }, at(T0));

      expect(listAgents(ctx.db, at(T0))[0]).toMatchObject({ live: true, listening: false });
      expect(listAgents(ctx.db, at(T2_31S))[0]).toMatchObject({ live: false, listening: false });
    });

    it('stops counting an agent listening once its listener ends, unless another heard it since', () => {
      const heard = hearAgent(ctx.db, { agent: 'claude', channel: 'mcp', session: 101 }, at(T0));
      endListening(ctx.db, 'claude', heard);
      expect(listAgents(ctx.db, at(T0_20S))[0]).toMatchObject({ listening: false });

      const first = hearAgent(ctx.db, { agent: 'claude', channel: 'mcp', session: 101 }, at(T0));
      hearAgent(ctx.db, { agent: 'claude', channel: 'cli' }, at(T0_20S));
      endListening(ctx.db, 'claude', first);
      expect(listAgents(ctx.db, at(T0_20S))[0]).toMatchObject({ listening: true });
    });

    it('counts an agent live while it listens: an open MCP server or a wait hears it', () => {
      hearAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));

      expect(listAgents(ctx.db, at(T2))).toEqual([
        {
          name: 'claude',
          harness: 'claude-code',
          harnessVersion: '2.1.0',
          connectedAt: T0,
          holding: [],
          lastSeen: T0,
          live: true,
          listening: true,
          waiting: false,
          profile: null,
          profileConfirmed: false,
          profileChangedAt: null,
          mcpAt: T0,
          mcpMissing: false,
          folder: null,
        },
      ]);
      expect(listAgents(ctx.db, at(T2_31S))[0]).toMatchObject({ live: false, listening: false });
    });

    // otea connect --as notes it asked for MCP: until it is heard through the server, the desk warns.
    it('flags an agent that asked for MCP and was never heard through it', () => {
      markMcpAsked(ctx.db, 'claude', T0);
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli' }, at(T2));
      expect(listAgents(ctx.db, at(T2))[0]).toMatchObject({ mcpAt: null, mcpMissing: true });

      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T5));
      expect(listAgents(ctx.db, at(T5))[0]).toMatchObject({ mcpAt: T5, mcpMissing: false });
    });

    it('hears an agent on every beat of its wait', () => {
      const beat = waitBeat(ctx.db, { agent: 'claude', channel: 'cli' }, at(T5));
      expect(beat.everyMs).toBeLessThanOrEqual(60_000);

      beat.run();

      expect(listAgents(ctx.db, at(T5_1S))[0]).toMatchObject({
        live: true,
        listening: true,
        waiting: true,
      });
    });

    it('counts only a wait as waiting: an open MCP server listens, its idle agent hears nothing', () => {
      hearAgent(ctx.db, { agent: 'claude', channel: 'mcp', session: 101 }, at(T5));
      expect(listAgents(ctx.db, at(T5_1S))[0]).toMatchObject({ listening: true, waiting: false });

      const beat = waitBeat(ctx.db, { agent: 'claude', channel: 'mcp' }, at(T5));
      const heard = beat.run();
      expect(listAgents(ctx.db, at(T5_1S))[0]).toMatchObject({ waiting: true });

      endWaiting(ctx.db, 'claude', heard);
      expect(listAgents(ctx.db, at(T5_1S))[0]).toMatchObject({ listening: true, waiting: false });
    });

    it('keeps the leases of a waiting agent alive on every beat: it waits on, it did not go quiet', () => {
      claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));
      claimItem(ctx, { id: 'TASKS-2', actor: claude, ttlMs: 60 * 60_000 }, at(T0));

      waitBeat(ctx.db, { agent: 'claude', channel: 'cli' }, at(T5)).run();

      const leases = listItems(ctx, {}, at(T5)).map(({ id, lease }) => [id, lease?.expiresAt]);
      expect(leases).toEqual([
        ['TASKS-1', '2026-01-01T00:20:00.000Z'],
        ['TASKS-2', '2026-01-01T01:00:00.000Z'],
      ]);
    });

    it('stops counting a wait as waiting a listening window after its last beat', () => {
      waitBeat(ctx.db, { agent: 'claude', channel: 'cli' }, at(T0)).run();

      expect(listAgents(ctx.db, at(T2_31S))[0]).toMatchObject({ waiting: false });
    });

    it('lists the items an agent holds a live lease on, and keeps it live while it holds them', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));
      claimItem(ctx, { id: 'TASKS-2', actor: claude, ttlMs: 60 * 60_000 }, at(T0));
      claimItem(ctx, { id: 'TASKS-1', actor: claude, ttlMs: 60 * 60_000 }, at(T0));

      expect(listAgents(ctx.db, at(T30))).toEqual([
        expect.objectContaining({
          name: 'claude',
          harness: 'claude-code',
          holding: ['TASKS-1', 'TASKS-2'],
          lastSeen: T0,
          live: true,
        }),
      ]);
    });

    it('drops expired and released leases from what an agent holds', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp' }, at(T0));
      claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T0));
      claimItem(ctx, { id: 'TASKS-2', actor: claude, ttlMs: 60 * 60_000 }, at(T0));
      releaseItem(ctx, { id: 'TASKS-2', actor: claude }, at(T0));

      expect(listAgents(ctx.db, at(T30))[0]).toMatchObject({ holding: [], live: false });
    });

    it('sorts live agents first, then the most recently seen', () => {
      seeAgent(ctx.db, { agent: 'old', channel: 'cli' }, at(T0));
      seeAgent(ctx.db, { agent: 'holder', channel: 'cli' }, at(T0));
      const holder: Actor = { kind: 'agent', name: 'holder' };
      claimItem(ctx, { id: 'TASKS-1', actor: holder, ttlMs: 60 * 60_000 }, at(T0));
      hearAgent(ctx.db, { agent: 'recent', channel: 'cli' }, at(T30));
      seeAgent(ctx.db, { agent: 'gone', channel: 'cli' }, at(T1));

      const names = listAgents(ctx.db, at(T30)).map(({ name, live }) => [name, live]);

      expect(names).toEqual([
        ['recent', true],
        ['holder', true],
        ['gone', false],
        ['old', false],
      ]);
    });
  });

  describe('connection and profile', () => {
    it('keeps when the agent connected while it stays, and starts again after it was away', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli' }, at(T0));
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli' }, at(T1));
      expect(findAgent(ctx.db, 'claude')?.connectedAt).toBe(T0);

      seeAgent(ctx.db, { agent: 'claude', channel: 'cli' }, at(T30));
      expect(findAgent(ctx.db, 'claude')?.connectedAt).toBe(T30);
    });

    it('starts a new connection with a new MCP session', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));
      seeAgent(
        ctx.db,
        { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE, newSession: true },
        at(T0_20S),
      );
      expect(findAgent(ctx.db, 'claude')?.connectedAt).toBe(T0_20S);
    });

    it('lists the profile the agent declared, whether it is confirmed, and when it last changed', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));
      const mcp = { agent: 'claude', channel: 'mcp' as const, harness: CLAUDE_CODE };
      declareProfile(ctx.db, { ...mcp, model: 'claude-opus-5-5', effort: 'high' }, at(T0));
      expect(listAgents(ctx.db, at(T1))[0]).toMatchObject({
        profile: {
          harness: 'claude-code',
          model: 'claude-opus-5-5',
          effort: 'high',
          family: 'opus',
        },
        profileConfirmed: true,
        profileChangedAt: null,
      });

      declareProfile(ctx.db, { ...mcp, model: 'claude-sonnet-5', effort: 'medium' }, at(T1));
      expect(listAgents(ctx.db, at(T1))[0]).toMatchObject({
        profile: { model: 'claude-sonnet-5', effort: 'medium' },
        profileChangedAt: T1,
      });
    });

    it('tells the stream when a profile is declared', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));
      const before = presenceSignature(ctx.db, at(T0));
      const mcp = { agent: 'claude', channel: 'mcp' as const, harness: CLAUDE_CODE };
      declareProfile(ctx.db, { ...mcp, model: 'claude-opus-5-5', effort: 'high' }, at(T0));

      expect(presenceSignature(ctx.db, at(T0))).not.toBe(before);
    });
  });

  describe('claimName', () => {
    const mcp = { agent: 'claude', channel: 'mcp' as const, harness: CLAUDE_CODE };
    const alive = (pids: number[]) => (pid: number) => pids.includes(pid);

    it('refuses a name another open MCP session works under, telling how to take another', () => {
      hearAgent(ctx.db, { ...mcp, session: 101 }, at(T0));

      expect(() => claimName(ctx.db, 'claude', 202, alive([101, 202]), at(T1))).toThrow(
        'Another session works as claude right now: give this one its own name, passing as "claude-2" on every call (no other agent or session has that name), and declare its profile under it',
      );
      expect(() => claimName(ctx.db, 'claude', 101, alive([101, 202]), at(T1))).not.toThrow();
    });

    // P6-R2-1, P8-R2-4: two sessions refused one name must not both move to the same "-2".
    it('names a free name: never a known agent, nor one just handed to another session', () => {
      hearAgent(ctx.db, { ...mcp, session: 101 }, at(T0));
      seeAgent(ctx.db, { agent: 'claude-2', channel: 'cli', harness: CLI_HARNESS }, at(T0));

      expect(() => claimName(ctx.db, 'claude', 202, alive([101, 202, 303]), at(T1))).toThrow(
        'passing as "claude-3"',
      );
      expect(() => claimName(ctx.db, 'claude', 303, alive([101, 202, 303]), at(T1))).toThrow(
        'passing as "claude-4"',
      );
      // The same session refused again is told the same name.
      expect(() => claimName(ctx.db, 'claude', 202, alive([101, 202, 303]), at(T1))).toThrow(
        'passing as "claude-3"',
      );
    });

    it('takes the name once that session closed or went quiet', () => {
      hearAgent(ctx.db, { ...mcp, session: 101 }, at(T0));

      expect(() => claimName(ctx.db, 'claude', 202, alive([202]), at(T1))).not.toThrow();
      expect(() => claimName(ctx.db, 'claude', 202, alive([101, 202]), at(T5))).not.toThrow();
    });

    it('gives the name to a new server the same harness started, and refuses the old one then', () => {
      hearAgent(ctx.db, { ...mcp, session: 101, launcher: 9 }, at(T0));

      expect(() =>
        claimName(ctx.db, 'claude', 202, alive([101, 202]), at(T1), 9, true),
      ).not.toThrow();
      hearAgent(ctx.db, { ...mcp, session: 202, launcher: 9 }, at(T1));
      expect(() => claimName(ctx.db, 'claude', 101, alive([101, 202]), at(T1), 9, false)).toThrow(
        'Another session works as claude right now',
      );
    });

    it('never gives the name to a new server another harness started', () => {
      hearAgent(ctx.db, { ...mcp, session: 101, launcher: 9 }, at(T0));

      expect(() => claimName(ctx.db, 'claude', 202, alive([101, 202]), at(T1), 10, true)).toThrow(
        'Another session works as claude right now',
      );
    });

    it('leaves a name a command-line wait listens under to the MCP session too', () => {
      hearAgent(ctx.db, { agent: 'claude', channel: 'cli', harness: CLI_HARNESS }, at(T0));

      expect(() => claimName(ctx.db, 'claude', 202, alive([202]), at(T1))).not.toThrow();
    });
  });

  describe('ownerGone', () => {
    const alive = (pids: number[]) => (pid: number) => pids.includes(pid);

    it('holds while the process that started the wait still runs', () => {
      expect(ownerGone(500, 500, alive([500]))).toBe(false);
    });

    it('is gone once that process ended, or the wait was handed to another parent', () => {
      expect(ownerGone(500, 500, alive([]))).toBe(true);
      expect(ownerGone(500, 1, alive([500]))).toBe(true);
    });

    it('is gone once any process of the chain that started it ended, though its parent runs', () => {
      expect(ownerGone(500, 500, alive([500, 600]), [500, 600, 700])).toBe(true);
      expect(ownerGone(500, 500, alive([500, 600, 700]), [500, 600, 700])).toBe(false);
    });

    it('never calls a wait started with no parent to watch orphaned', () => {
      expect(ownerGone(1, 1, alive([]))).toBe(false);
      expect(ownerGone(0, 0, alive([]))).toBe(false);
    });
  });

  describe('presenceSignature', () => {
    it('changes when an agent is seen anew, and not as time alone passes', () => {
      const before = presenceSignature(ctx.db, at(T0));
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp' }, at(T0));
      const after = presenceSignature(ctx.db, at(T0));

      expect(after).not.toBe(before);
      expect(presenceSignature(ctx.db, at(T30))).toBe(after);
    });
  });

  // otea whoami: a harness that keeps one MCP server for its new sessions asks through the server
  // its agent was heard by; a server whose harness was killed is no session.
  describe('nameFor', () => {
    const FOLDER = 'D:/work/shorty';
    const heardThrough = (session: number) =>
      hearAgent(
        ctx.db,
        { agent: 'bigp', channel: 'mcp', harness: { name: 'opencode' }, session, folder: FOLDER },
        at(T0),
      );

    it('never gives a name another open session listens under', () => {
      heardThrough(101);
      expect(
        nameFor(ctx.db, { folder: FOLDER, harness: 'opencode' }, at(T0), () => true).name,
      ).toBeNull();
    });

    it('gives it to the server it was heard through, and when that server is gone', () => {
      heardThrough(101);
      const ask = (session: number | undefined, alive: boolean) =>
        nameFor(ctx.db, { folder: FOLDER, harness: 'opencode', session }, at(T0), () => alive).name;
      expect(ask(101, true)).toBe('bigp');
      expect(ask(202, false)).toBe('bigp');
    });
  });

  // P6-R2-1: two sessions started together both asked otea whoami, both were told the one name,
  // and both worked under it. whoami hands a name to one session at a time.
  describe('offerName', () => {
    const FOLDER = 'D:/work/shorty';
    beforeEach(() => {
      seeAgent(
        ctx.db,
        { agent: 'ana', channel: 'cli', harness: CLI_HARNESS, folder: FOLDER },
        at('2025-12-31T23:00:00.000Z'),
      );
    });
    const ask = (time: string, session?: number) =>
      offerName(ctx.db, { folder: FOLDER, harness: 'claude-code', session }, at(time), () => true);

    it('hands sessions asking at once distinct names', () => {
      expect(ask(T0)).toMatchObject({ name: 'ana', suggested: null });
      expect(ask(T0_20S)).toMatchObject({ name: null, suggested: 'ana-2' });
      expect(ask(T1)).toMatchObject({ name: null, suggested: 'ana-3' });
    });

    it('tells an MCP session that asks again the name it was handed', () => {
      expect(ask(T0, 101).name).toBe('ana');
      expect(ask(T0_20S, 101).name).toBe('ana');
      expect(ask(T1, 202)).toMatchObject({ name: null, suggested: 'ana-2' });
      expect(ask(T2, 202)).toMatchObject({ name: null, suggested: 'ana-2' });
    });

    it('hands the name out again once no session took it for a while', () => {
      expect(ask(T0).name).toBe('ana');
      expect(ask(T5_1S).name).toBe('ana');
    });

    it('counts a name handed out as taken for other sessions', () => {
      ask(T0);
      expect(ask(T0_20S).working).toContain('ana');
    });
  });
});
