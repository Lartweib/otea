import { describe, expect, it } from 'vitest';
import type { FeedEvent } from '../../activity.ts';
import { agent, ago, item, moved, you } from '../../derive/fixtures.ts';
import {
  type AgentStep,
  eligibility,
  lastHandoffs,
  parseAgentDetail,
  profileTrail,
} from './agent-sheet.ts';

const opus = { harness: 'claude-code', model: 'opus', effort: 'high', family: 'opus' };
const sonnet = { harness: 'claude-code', model: 'sonnet', effort: 'medium', family: 'sonnet' };

describe('the profile’s story', () => {
  it('tells it newest first: what it declared, then each change of model or effort', () => {
    const renamed = { ...opus, harness: 'claude-code-2' };
    expect(
      profileTrail([
        { profile: opus, at: 'a' },
        { profile: renamed, at: 'b' },
        { profile: sonnet, at: 'c' },
      ]),
    ).toEqual([
      { at: 'c', from: opus, to: sonnet },
      { at: 'a', to: opus },
    ]);
  });
});

describe('the last handoffs', () => {
  const turnOf = (_: string, state: string) => (state === 'verify' ? 'human' : 'agent');
  const items = [item({ id: 'A', title: 'Exportar CSV' }), item({ id: 'B', title: 'Login' })];

  it('lists its handoffs to you, newest first, with the round, the profile and what became of each', () => {
    const feed: FeedEvent[] = [
      { ...moved('A', 'verify', agent('codex-b'), { minutes: 60 }), profile: opus },
      moved('A', 'fixing', you, { reason: 'Falta la fecha.', minutes: 50 }),
      { ...moved('A', 'verify', agent('claude-d'), { minutes: 40 }), profile: opus },
      { ...moved('B', 'verify', agent('claude-d'), { minutes: 90 }), profile: sonnet },
      moved('B', 'fixed', you, { minutes: 80 }),
    ];
    expect(lastHandoffs('claude-d', feed, items, turnOf)).toEqual([
      { id: 'A', title: 'Exportar CSV', at: ago(40), round: 2, profile: opus, status: 'review' },
      { id: 'B', title: 'Login', at: ago(90), round: 1, profile: sonnet, status: 'on' },
    ]);
    expect(lastHandoffs('codex-b', feed, items, turnOf)[0]?.status).toBe('back');
  });
});

describe('what it may take', () => {
  const step = (name: string, doer: AgentStep['doer'], reviewer: AgentStep['reviewer']) => ({
    board: 'Tareas',
    step: name,
    name,
    doer,
    reviewer,
  });

  it('lists the steps it can do as any agent first, then your steps and those of another', () => {
    const rows = eligibility('claude-d', [
      step('Verificar', { kind: 'you' }, { kind: 'none' }),
      step('Hacerlo', { kind: 'any' }, { kind: 'any' }),
      step('Diseñar', { kind: 'agent', agent: 'kiln' }, { kind: 'you' }),
    ]);
    expect(rows.map((r) => [r.name, r.review, r.can, r.why])).toEqual([
      ['Hacerlo', false, true, 'any'],
      ['Hacerlo', true, true, 'notOwn'],
      ['Verificar', false, false, 'yours'],
      ['Diseñar', false, false, 'other'],
    ]);
  });
});

describe('the detail as the server gives it', () => {
  it('reads profiles and steps, leaving out what it cannot read', () => {
    expect(
      parseAgentDetail({
        profiles: [
          { profile: opus, at: 'a' },
          { profile: {}, at: 'b' },
        ],
        steps: [
          {
            board: 'T',
            step: 's1',
            name: 'Hacerlo',
            doer: { kind: 'any' },
            reviewer: { kind: 'x' },
          },
          { name: 3 },
        ],
      }),
    ).toEqual({
      profiles: [{ profile: opus, at: 'a' }],
      steps: [
        {
          board: 'T',
          step: 's1',
          name: 'Hacerlo',
          doer: { kind: 'any' },
          reviewer: { kind: 'any' },
        },
      ],
    });
  });
});
