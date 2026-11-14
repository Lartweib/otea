import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { appendEvent, findProfile, selectProfileChanges } from '../store/queries.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem } from './items.ts';
import { claimItem } from './leases.ts';
import { LIVE_WINDOW_MS, seeAgent, waitBeat } from './presence.ts';
import { declareProfile, requireProfile } from './profile.ts';
import { memoryContext } from './testing.ts';

const ana: Actor = { kind: 'human', name: 'ana' };
const claude: Actor = { kind: 'agent', name: 'claude' };

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-01T00:01:00.000Z';
const T30 = '2026-01-01T00:30:00.000Z';
const T2H = '2026-01-01T02:00:00.000Z';
const at = (time: string) => () => time;

const CLAUDE_CODE = { name: 'claude-code', version: '2.1.0' };
const OPUS = { model: 'claude-opus-5-5', effort: 'high' };

describe('agent profile', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext();
    addCollection(ctx, { name: 'tasks' });
    const task = { collection: 'tasks', fields: { description: 'Details' }, actor: ana };
    createItem(ctx, { ...task, title: 'First' }, at(T0));
  });

  afterEach(() => ctx.db.close());

  const declare = (
    { harness, ...values }: { model: string; effort: string; harness?: string },
    channel: 'cli' | 'mcp' = 'cli',
  ) =>
    declareProfile(
      ctx.db,
      {
        agent: 'claude',
        channel,
        harness: channel === 'mcp' ? CLAUDE_CODE : { name: 'cli' },
        ...values,
        ...(harness === undefined ? {} : { given: harness }),
      },
      at(T0),
    );

  describe('declareProfile', () => {
    it('keeps the model and effort as declared, with the family the model groups under', () => {
      const declared = declare({ ...OPUS, harness: 'codex' });

      expect(declared.profile).toEqual({
        harness: 'codex',
        model: 'claude-opus-5-5',
        effort: 'high',
        family: 'opus',
      });
      expect(findProfile(ctx.db, 'claude')).toEqual({
        profile: { harness: 'codex', model: 'claude-opus-5-5', effort: 'high' },
        confirmed: true,
      });
    });

    it('takes the harness from the MCP client, whatever the agent says', () => {
      expect(declare({ ...OPUS, harness: 'other' }, 'mcp').profile.harness).toBe('claude-code');
    });

    it('asks a command-line agent for its harness the first time', () => {
      expect(() => declare(OPUS)).toThrow(/--harness/);
    });

    it('keeps the harness it knows when the agent declares again', () => {
      declare({ ...OPUS, harness: 'codex' });

      expect(declare({ model: 'gpt-5', effort: 'low' }).profile.harness).toBe('codex');
    });

    it('keeps each change, and only changes, in the history', () => {
      declare({ ...OPUS, harness: 'codex' });
      declare({ ...OPUS, harness: 'codex' });
      declare({ ...OPUS, effort: 'max' });

      const efforts = selectProfileChanges(ctx.db, 'claude').map(({ profile }) => profile.effort);
      expect(efforts).toEqual(['high', 'max']);
    });

    it('refuses a value of more than one word', () => {
      expect(() => declare({ model: 'claude opus', effort: 'high', harness: 'codex' })).toThrow(
        expect.objectContaining({ code: 'invalid_profile' }),
      );
    });
  });

  describe('events', () => {
    it('keep the profile the agent had when it wrote them', () => {
      declare({ ...OPUS, harness: 'codex' });
      claimItem(ctx, { id: 'TASKS-1', actor: claude }, at(T1));

      const claimed = getItem(ctx, 'TASKS-1', at(T1)).events.at(-1);
      expect(claimed?.profile).toEqual({
        harness: 'codex',
        model: 'claude-opus-5-5',
        effort: 'high',
        family: 'opus',
      });
    });

    it('keep the profile of the agent relaying the person', () => {
      declare({ ...OPUS, harness: 'codex' });
      const data = { via: 'claude', quote: 'Yes' };
      appendEvent(ctx.db, { itemId: 'TASKS-1', type: 'transitioned', actor: ana, at: T1, data });

      expect(getItem(ctx, 'TASKS-1', at(T1)).events.at(-1)?.profile?.model).toBe('claude-opus-5-5');
    });

    it('carry no profile for the person', () => {
      expect(getItem(ctx, 'TASKS-1', at(T1)).events[0]?.profile).toBeUndefined();
    });
  });

  describe('sessions', () => {
    it('leave the profile unconfirmed when the agent starts a new MCP session', () => {
      declare(OPUS, 'mcp');
      seeAgent(
        ctx.db,
        { agent: 'claude', channel: 'mcp', harness: CLAUDE_CODE, newSession: true },
        at(T1),
      );

      expect(findProfile(ctx.db, 'claude')?.confirmed).toBe(false);
    });

    it('keep it confirmed while a command-line agent keeps working', () => {
      declare({ ...OPUS, harness: 'codex' });
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli' }, at(T30));

      expect(findProfile(ctx.db, 'claude')?.confirmed).toBe(true);
    });

    it('leave it unconfirmed when a command-line agent comes back after an hour away', () => {
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli' }, at(T0));
      declare({ ...OPUS, harness: 'codex' });
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli' }, at(T2H));

      expect(findProfile(ctx.db, 'claude')?.confirmed).toBe(false);
    });

    it('keep it confirmed through an otea wait of hours: the wait sees the agent as it waits', () => {
      let time = Date.parse(T0);
      const clock = () => new Date(time).toISOString();
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli' }, clock);
      declare({ ...OPUS, harness: 'codex' });
      const beat = waitBeat(ctx.db, { agent: 'claude', channel: 'cli', newSession: true }, clock);
      expect(beat.everyMs).toBeLessThan(LIVE_WINDOW_MS);
      while (time < Date.parse(T2H)) {
        time += beat.everyMs;
        beat.run();
      }
      seeAgent(ctx.db, { agent: 'claude', channel: 'cli' }, clock);

      expect(findProfile(ctx.db, 'claude')?.confirmed).toBe(true);
    });

    it('follow the MCP client when it names another harness', () => {
      declare(OPUS, 'mcp');
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', harness: { name: 'codex' } }, at(T1));

      expect(findProfile(ctx.db, 'claude')?.profile.harness).toBe('codex');
    });
  });

  describe('requireProfile', () => {
    it('refuses an agent with no profile, saying how to declare it', () => {
      expect(() => requireProfile(ctx.db, 'claude', { channel: 'cli' })).toThrow(
        expect.objectContaining({
          code: 'profile_required',
          message: expect.stringContaining('otea profile --model <id> --effort <level>'),
        }),
      );
    });

    it('lets an unconfirmed profile claim, but not ask for work', () => {
      declare(OPUS, 'mcp');
      seeAgent(ctx.db, { agent: 'claude', channel: 'mcp', newSession: true }, at(T1));

      expect(requireProfile(ctx.db, 'claude', { channel: 'mcp' }).model).toBe('claude-opus-5-5');
      expect(() => requireProfile(ctx.db, 'claude', { channel: 'mcp', confirmed: true })).toThrow(
        /not confirmed in this session/,
      );
    });
  });
});
