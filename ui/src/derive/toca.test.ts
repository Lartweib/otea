import { describe, expect, it } from 'vitest';
import type { FeedEvent } from '../activity.ts';
import type { Item } from '../types.ts';
import { agent, ago, inMinutes, item, moved, NOW, officialType, you } from './fixtures.ts';
import { agentOf, boardCounts, handedNote, stuckCount, tocaCount, tocaSection } from './toca.ts';

const bug = officialType('bug-triage');
const ctx = (feed: FeedEvent[] = []) => ({ now: NOW, feed, types: () => bug });

describe('the section of Te toca an item is in', () => {
  it('puts closed work of the last seven days in Cerrados, and older closed work nowhere', () => {
    const fresh = item({ id: 'A', turn: 'none', state: 'fixed', updatedAt: ago(60 * 24 * 6) });
    const old = item({ id: 'B', turn: 'none', state: 'fixed', updatedAt: ago(60 * 24 * 8) });
    expect(tocaSection(fresh, ctx())).toBe('cerrados');
    expect(tocaSection(old, ctx())).toBeNull();
  });

  it('puts an agent that went quiet in Atasco, while nobody holds the item again', () => {
    const lapsed = { holder: 'kiln', expiresAt: ago(12) };
    const stuck = item({ id: 'A', turn: 'agent', state: 'fixing', expiredLease: lapsed });
    const retaken = item({
      id: 'B',
      turn: 'agent',
      state: 'fixing',
      expiredLease: lapsed,
      lease: { holder: 'mender', expiresAt: inMinutes(30) },
    });
    expect(tocaSection(stuck, ctx())).toBe('atasco');
    expect(tocaSection(retaken, ctx())).toBe('encamino');
  });

  it('reads a handoff whose words end in a question as a question for you', () => {
    const asked = item({ id: 'A', state: 'verify' });
    const feed = [moved('A', 'verify', agent('mender'), { reason: '¿Lo dejamos en 60 fps? ' })];
    expect(tocaSection(asked, ctx(feed))).toBe('preguntas');
  });

  it('reads your own new item, still where its type starts, as your own step', () => {
    const own = item({ id: 'A', state: 'reported', createdBy: you });
    const filed = item({ id: 'B', state: 'reported', createdBy: agent('scout') });
    expect(tocaSection(own, ctx())).toBe('propios');
    expect(tocaSection(filed, ctx())).toBe('revisiones');
  });

  it('on a board, files a step you do yourself in Tus propios pasos, whoever handed it to you', () => {
    const feed = [moved('A', 'striage', agent('kiln'), { reason: 'Completo.' })];
    const board = { ...ctx(feed), onBoard: () => true };
    expect(tocaSection(item({ id: 'A', state: 'striage', createdBy: agent('kiln') }), board)).toBe(
      'propios',
    );
    expect(tocaSection(item({ id: 'B', state: 'sfix__review' }), board)).toBe('revisiones');
    expect(tocaSection(item({ id: 'C', state: 'sfix__yours' }), board)).toBe('revisiones');
  });

  it('puts every other item on your turn in Revisiones, and every other agent item En camino', () => {
    const feed = [moved('A', 'verify', agent('mender'), { reason: 'Hecho, con la prueba.' })];
    expect(tocaSection(item({ id: 'A', state: 'verify' }), ctx(feed))).toBe('revisiones');
    expect(tocaSection(item({ id: 'C', turn: 'agent', state: 'fixing' }), ctx())).toBe('encamino');
  });
});

describe('the counts of Te toca', () => {
  const items: Item[] = [
    item({ id: 'A' }),
    item({ id: 'B' }),
    item({ id: 'C', turn: 'agent', expiredLease: { holder: 'kiln', expiresAt: ago(5) } }),
    item({ id: 'D', turn: 'agent', collection: 'Arte' }),
    item({ id: 'E', turn: 'none', collection: 'Arte' }),
  ];

  it('counts what is on your turn and what is stuck', () => {
    expect(tocaCount(items, ctx())).toBe(3);
    expect(stuckCount(items, ctx())).toBe(1);
  });

  it('counts a board’s items on your turn and its open ones', () => {
    expect(boardCounts(items, 'Errores')).toEqual({ yours: 2, open: 3 });
    expect(boardCounts(items, 'Arte')).toEqual({ yours: 0, open: 1 });
  });
});

describe('who handed an item over, and who has it', () => {
  it('reads the last agent move into the item’s current state', () => {
    const feed = [
      moved('A', 'verify', agent('kiln'), { reason: 'Primera vuelta.', minutes: 90 }),
      moved('A', 'fixing', you, { reason: 'Falta el borde.', minutes: 60, from: 'verify' }),
      moved('A', 'verify', agent('mender'), { reason: 'Ahora sí.', minutes: 14 }),
      moved('B', 'verify', agent('scout'), { minutes: 5 }),
    ];
    expect(handedNote(item({ id: 'A' }), feed)).toEqual({
      agent: 'mender',
      reason: 'Ahora sí.',
      at: ago(14),
    });
    expect(handedNote(item({ id: 'B' }), feed)).toEqual({ agent: 'scout', reason: '', at: ago(5) });
  });

  it('has no note when you moved it there, or nothing did', () => {
    const feed = [moved('A', 'verify', you, { reason: 'Lo vuelvo a mirar.' })];
    expect(handedNote(item({ id: 'A' }), feed)).toBeNull();
    expect(handedNote(item({ id: 'Z' }), feed)).toBeNull();
  });

  it('names the agent that holds it, else the one whose lease ran out, else the last that moved it', () => {
    const feed = [moved('A', 'fixing', agent('scout'), { minutes: 50 })];
    const held = item({ id: 'A', lease: { holder: 'mender', expiresAt: inMinutes(9) } });
    const lapsed = item({ id: 'A', expiredLease: { holder: 'kiln', expiresAt: ago(3) } });
    expect(agentOf(held, feed)).toBe('mender');
    expect(agentOf(lapsed, feed)).toBe('kiln');
    expect(agentOf(item({ id: 'A' }), feed)).toBe('scout');
    expect(agentOf(item({ id: 'Q' }), feed)).toBeNull();
  });
});
