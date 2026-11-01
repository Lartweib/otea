import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Channel } from '../core/authority.ts';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem, moveItem, showItem, updateItem } from './items.ts';
import { claimItem } from './leases.ts';
import { OFFICIAL_PRESETS_DIR, requirePreset } from './presets.ts';
import { relayDecision } from './relay.ts';
import { memoryContext } from './testing.ts';
import { validateProject } from './validate.ts';

const claude: Actor = { kind: 'agent', name: 'claude' };
const human: Actor = { kind: 'human', name: 'human' };

const T0 = '2026-01-01T00:00:00.000Z';
const at = () => T0;

const REPORT = {
  description: 'Saving a draft with an emoji in the title crashes the editor.',
  steps: '1. Open a new draft\n2. Type "Hi 👋" as the title\n3. Press Save',
  expected: 'The draft is saved.',
  actual: 'The editor shows a blank page and the console logs a RangeError.',
  environment: 'Firefox 131, macOS 15',
  severity: 'high',
};

const playbook = () =>
  readFileSync(join(OFFICIAL_PRESETS_DIR, 'bug-triage', 'playbook.md'), 'utf8');

describe('bug-triage preset', () => {
  let ctx: Context;

  const file = (
    fields: Record<string, string> = REPORT,
    title = 'Emoji title crashes the editor',
  ) => createItem(ctx, { collection: 'bugs', title, fields, actor: claude }, at).id;
  const move = (
    id: string,
    to: string,
    actor = claude,
    channel: Channel = 'cli',
    reason?: string,
  ) => moveItem(ctx, { id, to, actor, channel, ...(reason ? { reason } : {}) }, at);
  const triage = (id: string, to: string, reason?: string) => move(id, to, human, 'ui', reason);
  const relay = (id: string, to: string, reason?: string) =>
    relayDecision(
      ctx,
      {
        id,
        to,
        via: 'claude',
        channel: 'cli',
        quote: 'Yes, go ahead',
        ...(reason ? { reason } : {}),
      },
      at,
    );
  const stateOf = (id: string) => getItem(ctx, id, at).state;

  beforeEach(() => {
    ctx = memoryContext();
    addCollection(ctx, { name: 'bugs', preset: 'bug-triage' });
  });

  afterEach(() => ctx.db.close());

  it('ships as an official preset with a playbook, and validates clean', () => {
    const preset = requirePreset(ctx.presets, 'bug-triage');
    file();
    file({}, 'Players say the map flickers');

    expect(preset).toMatchObject({ origin: 'official', playbook: './playbook.md' });
    expect(preset.fields.severity).toEqual({
      module: 'severity',
      required: 'complete',
      values: ['low', 'medium', 'high', 'critical'],
    });
    expect(ctx.presets.problems).toEqual([]);
    expect(validateProject(ctx)).toEqual({ errors: 0, warnings: 0, findings: [] });
  });

  it('lists bugs in a grid, with category as an enum and area as free text', () => {
    const preset = requirePreset(ctx.presets, 'bug-triage');

    expect(preset.version).toBe(2);
    expect(preset.fields.category).toEqual({
      module: 'enum',
      values: ['crash', 'visual', 'gameplay', 'physics', 'audio', 'performance', 'ui'],
    });
    expect(preset.fields.area).toEqual({ module: 'text' });
    expect(preset.view).toEqual({
      kind: 'grid',
      groupBy: 'turn',
      columns: ['id', 'title', 'category', 'severity', 'area', 'state', 'who', 'age'],
    });
  });

  it('files a complete report for triage, and a bare one as incomplete', () => {
    const complete = file();
    const bare = file({}, 'Players say the map flickers');

    expect(getItem(ctx, complete, at)).toMatchObject({ state: 'reported', turn: 'human' });
    expect(getItem(ctx, bare, at)).toMatchObject({ state: 'incomplete', turn: 'agent' });
    expect(showItem(ctx, bare, { actor: claude, channel: 'cli' }, at).missing).toEqual([
      'description',
      'steps',
      'expected',
      'actual',
      'severity',
    ]);
  });

  it('refuses to send an incomplete report to triage until the agent fills it in', () => {
    const id = file({ description: 'Flickers' }, 'Map flickers');

    expect(() => move(id, 'reported')).toThrow(expect.objectContaining({ code: 'missing_fields' }));
    const { description: _, ...rest } = REPORT;
    updateItem(ctx, { id, fields: rest, actor: claude }, at);

    expect(move(id, 'reported').state).toBe('reported');
  });

  it('takes a bug from report to fixed: accepted, fixing, verify with proof, approved', () => {
    const id = file();

    triage(id, 'accepted');
    claimItem(ctx, { id, actor: claude }, at);
    move(id, 'fixing');
    expect(() => move(id, 'verify')).toThrow(expect.objectContaining({ code: 'reason_required' }));
    const proof = 'Commit abc123; npm test: 212 passed; saving "Hi 👋" now works';
    const verify = move(id, 'verify', claude, 'cli', proof);

    expect(verify).toMatchObject({ state: 'verify', turn: 'human', lease: null });
    expect(getItem(ctx, id, at).events.at(-2)?.data).toMatchObject({ to: 'verify', reason: proof });
    expect(triage(id, 'fixed')).toMatchObject({ state: 'fixed', turn: 'none' });
  });

  it('loops through needs_info: the human asks, the agent adds details and reports again', () => {
    const id = file();

    expect(() => triage(id, 'needs_info')).toThrow(
      expect.objectContaining({ code: 'reason_required' }),
    );
    expect(triage(id, 'needs_info', 'Which browser version?')).toMatchObject({ turn: 'agent' });
    updateItem(ctx, { id, fields: { environment: 'Firefox 131.0.2' }, actor: claude }, at);

    expect(move(id, 'reported')).toMatchObject({ state: 'reported', turn: 'human' });
  });

  it('sends a fix back to fixing with a reason, and lets the agent return a bug to triage', () => {
    const id = file();
    triage(id, 'accepted');
    move(id, 'fixing');
    move(id, 'verify', claude, 'cli', 'Commit abc123');

    expect(triage(id, 'fixing', 'Still crashes with two emoji')).toMatchObject({ turn: 'agent' });
    expect(() => move(id, 'reported')).toThrow(
      expect.objectContaining({ code: 'reason_required' }),
    );
    expect(move(id, 'reported', claude, 'cli', 'Cannot reproduce on main')).toMatchObject({
      state: 'reported',
      turn: 'human',
    });
  });

  it.each(['rejected', 'duplicate', 'wont_fix'])('closes a report as %s with a reason', (to) => {
    const id = file();

    expect(() => triage(id, to)).toThrow(expect.objectContaining({ code: 'reason_required' }));
    expect(triage(id, to, 'Not a bug: by design')).toMatchObject({ state: to, turn: 'none' });
  });

  it('never lets the agent approve, reject or triage its own report', () => {
    const id = file();
    for (const to of ['accepted', 'needs_info', 'rejected', 'duplicate', 'wont_fix']) {
      expect(() => move(id, to, claude, 'cli', 'Because')).toThrow(
        expect.objectContaining({ code: 'forbidden' }),
      );
    }
    triage(id, 'accepted');
    move(id, 'fixing');
    move(id, 'verify', claude, 'cli', 'Commit abc123');

    for (const channel of ['cli', 'mcp'] as const) {
      expect(() => move(id, 'fixed', claude, channel)).toThrow(
        expect.objectContaining({ code: 'forbidden' }),
      );
    }
    expect(stateOf(id)).toBe('verify');
  });

  it('relays accepting, asking for info and sending back, but never approving or closing', () => {
    const asked = file();
    const accepted = file();

    expect(relay(asked, 'needs_info', 'Which browser?')).toMatchObject({ state: 'needs_info' });
    expect(relay(accepted, 'accepted')).toMatchObject({ state: 'accepted' });
    for (const to of ['rejected', 'duplicate', 'wont_fix']) {
      expect(() => relay(file(), to, 'Not a bug')).toThrow(
        expect.objectContaining({ code: 'forbidden' }),
      );
    }
    move(accepted, 'fixing');
    expect(() => relay(accepted, 'verify', 'Done')).toThrow(
      expect.objectContaining({ code: 'not_relayable' }),
    );
    move(accepted, 'verify', claude, 'cli', 'Commit abc123');

    expect(() => relay(accepted, 'fixed')).toThrow(expect.objectContaining({ code: 'forbidden' }));
    expect(relay(accepted, 'fixing', 'Still broken')).toMatchObject({ state: 'fixing' });
  });

  it('lists the relayable decisions of a reported bug and of one in verify', () => {
    const id = file();
    const relayable = () =>
      showItem(ctx, id, { actor: claude, channel: 'cli' }, at).relayable.map(({ to }) => to);

    expect(relayable()).toEqual(['accepted', 'needs_info']);
    triage(id, 'accepted');
    move(id, 'fixing');
    move(id, 'verify', claude, 'cli', 'Commit abc123');
    expect(relayable()).toEqual(['fixing']);
  });

  it('ships a playbook with the agent loop, the evidence, the proof and the relay rules', () => {
    const text = playbook();

    for (const phrase of [
      'otea wait --turn agent --unclaimed',
      'otea claim',
      'otea attach <id> <file>',
      '--role before',
      '--role after',
      'otea move <id> verify --reason',
      'otea relay',
      'You never approve your own fix',
    ]) {
      expect(text).toContain(phrase);
    }
  });
});
