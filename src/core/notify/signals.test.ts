import { describe, expect, it } from 'vitest';
import { freshSignals, type NotifyFacts, signalsOf } from './signals.ts';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const later = '2026-11-14T10:10:00.000Z';
const earlier = '2026-11-14T09:50:00.000Z';

const item = (over: Partial<NotifyFacts> = {}): NotifyFacts => ({
  id: 'TASKS-1',
  title: 'Ship the login',
  state: 'build__review',
  turn: 'human',
  lease: null,
  ...over,
});

const kinds = (facts: NotifyFacts[]) => signalsOf(facts, NOW).map(({ kind }) => kind);

describe('signalsOf', () => {
  it('says an item on your turn is yours: a review', () => {
    expect(signalsOf([item()], NOW)).toEqual([
      {
        key: 'turn:TASKS-1:build__review:',
        kind: 'turn',
        item: 'TASKS-1',
        title: 'Ship the login',
      },
    ]);
  });

  it('says who asks when an agent’s question waits for you', () => {
    const [signal] = signalsOf([item({ asks: { question: 2, by: 'claude' } })], NOW);
    expect(signal).toMatchObject({ kind: 'turn', asks: true, by: 'claude' });
    expect(signal?.key).toBe('turn:TASKS-1:build__review::q2');
  });

  it('tells a new round on your turn from the one before', () => {
    const [one] = signalsOf([item({ round: 1 })], NOW);
    const [two] = signalsOf([item({ round: 2 })], NOW);
    expect(one?.key).not.toBe(two?.key);
  });

  it('says nothing of an item on an agent’s turn that is moving, or one that is closed', () => {
    expect(kinds([item({ turn: 'agent', lease: { holder: 'claude', expiresAt: later } })])).toEqual(
      [],
    );
    expect(kinds([item({ turn: 'none' })])).toEqual([]);
  });

  it('says an item got stuck when its agent’s lease ran out with nobody taking it', () => {
    const stuck = item({
      turn: 'agent',
      lease: null,
      expiredLease: { holder: 'codex', expiresAt: earlier },
    });
    expect(signalsOf([stuck], NOW)).toEqual([
      {
        key: `stuck:TASKS-1:codex:${earlier}`,
        kind: 'stuck',
        item: 'TASKS-1',
        title: 'Ship the login',
        by: 'codex',
      },
    ]);
  });

  it('says an agent answered your note, once per answer', () => {
    const answered = item({
      turn: 'agent',
      lease: { holder: 'claude', expiresAt: later },
      notes: { replied: { note: 3, by: 'claude', at: earlier } },
    });
    expect(signalsOf([answered], NOW)).toEqual([
      {
        key: `replied:TASKS-1:3:${earlier}`,
        kind: 'replied',
        item: 'TASKS-1',
        title: 'Ship the login',
        by: 'claude',
      },
    ]);
  });
});

describe('freshSignals', () => {
  const yours = signalsOf([item()], NOW);

  it('takes the first look as the starting point: nothing is new yet', () => {
    expect(freshSignals(undefined, yours)).toEqual([]);
  });

  it('keeps what was not there the last time', () => {
    expect(freshSignals(new Set(), yours)).toEqual(yours);
    expect(freshSignals(new Set(yours.map(({ key }) => key)), yours)).toEqual([]);
  });
});
