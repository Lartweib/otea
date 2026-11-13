import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { creatures } from '../core/board/testing.ts';
import { agentDetail } from './agent-detail.ts';
import type { Context } from './context.ts';
import { seeAgent } from './presence.ts';
import { declareProfile } from './profile.ts';
import { memoryContext, publishAs } from './testing.ts';

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-01T00:01:00.000Z';
const at = (time: string) => () => time;
const CLAUDE_CODE = { name: 'claude-code', version: '2.1.0' };

describe('agentDetail', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = memoryContext();
  });

  afterEach(() => ctx.db.close());

  it('refuses an agent never seen', () => {
    expect(() => agentDetail(ctx, 'ghost', at(T0))).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });

  it('gives its presence and every profile it declared, oldest first', () => {
    const mcp = { agent: 'kiln', channel: 'mcp' as const, harness: CLAUDE_CODE };
    seeAgent(ctx.db, mcp, at(T0));
    declareProfile(ctx.db, { ...mcp, model: 'claude-opus-5-5', effort: 'high' }, at(T0));
    declareProfile(ctx.db, { ...mcp, model: 'claude-sonnet-5', effort: 'medium' }, at(T1));

    const detail = agentDetail(ctx, 'kiln', at(T1));

    expect(detail.agent).toMatchObject({ name: 'kiln', harnessVersion: '2.1.0', live: true });
    expect(detail.profiles.map(({ profile, at: when }) => [profile.model, when])).toEqual([
      ['claude-opus-5-5', T0],
      ['claude-sonnet-5', T1],
    ]);
  });

  it('lists the steps of every live board with who does and who reviews each', () => {
    seeAgent(ctx.db, { agent: 'kiln', channel: 'cli' }, at(T0));
    publishAs(ctx, creatures(), 'b1', at(T0));

    const { steps } = agentDetail(ctx, 'kiln', at(T0));

    expect(steps[0]).toEqual({
      board: 'Criaturas',
      step: expect.any(String),
      name: expect.any(String),
      doer: expect.objectContaining({ kind: expect.any(String) }),
      reviewer: expect.objectContaining({ kind: expect.any(String) }),
    });
    expect(steps.some(({ doer }) => doer.kind === 'you')).toBe(true);
    expect(steps.some(({ doer }) => doer.kind === 'any')).toBe(true);
  });
});
