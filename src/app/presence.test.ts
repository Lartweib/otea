import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { findAgent } from '../store/queries.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem } from './items.ts';
import { claimItem, releaseItem } from './leases.ts';
import { CLI_HARNESS, listAgents, presenceSignature, seeAgent } from './presence.ts';
import { declareProfile } from './profile.ts';
import { memoryContext } from './testing.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const claude: Actor = { kind: 'agent', name: 'claude' };

const T0 = '2026-01-01T00:00:00.000Z';
const T0_20S = '2026-01-01T00:00:20.000Z';
const T1 = '2026-01-01T00:01:00.000Z';
const T5 = '2026-01-01T00:05:00.000Z';
const T5_1S = '2026-01-01T00:05:01.000Z';
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

    it('counts an agent as live for five minutes after it was seen', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE }, at(T0));

      expect(listAgents(ctx.db, at(T5))).toEqual([
        {
          name: 'claude',
          harness: 'claude-code',
          harnessVersion: '2.1.0',
          connectedAt: T0,
          holding: [],
          lastSeen: T0,
          live: true,
          profile: null,
          profileConfirmed: false,
          profileChangedAt: null,
        },
      ]);
      expect(listAgents(ctx.db, at(T5_1S))[0]?.live).toBe(false);
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
      seeAgent(ctx.db, { agent: 'recent', channel: 'cli' }, at(T30));
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

  describe('presenceSignature', () => {
    it('changes when an agent is seen anew, and not as time alone passes', () => {
      const before = presenceSignature(ctx.db, at(T0));
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp' }, at(T0));
      const after = presenceSignature(ctx.db, at(T0));

      expect(after).not.toBe(before);
      expect(presenceSignature(ctx.db, at(T30))).toBe(after);
    });
  });
});
