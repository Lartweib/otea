import { describe, expect, it } from 'vitest';
import { agoLabel, handoffOf, leadRelation, waitingChildren } from './handoff.ts';
import type { ItemEvent, RelatedItem } from './types.ts';

const agent = (name: string) => ({ kind: 'agent', name }) as const;
const human = { kind: 'human', name: 'human' } as const;
let id = 0;
const event = (
  type: string,
  actor: ItemEvent['actor'],
  data: Record<string, unknown>,
  at = '2026-11-01T10:00:00Z',
): ItemEvent => ({
  id: ++id,
  type,
  actor,
  at,
  data,
});

const related = (
  kind: RelatedItem['kind'],
  itemId: string,
  turn: RelatedItem['turn'] = 'agent',
): RelatedItem => ({
  kind,
  id: itemId,
  collection: 'parts',
  type: 'item',
  title: itemId.toLowerCase(),
  state: 'todo',
  turn,
  lease: null,
});

describe('handoffOf', () => {
  it('is the agent that created the item when nothing moved it since', () => {
    const events = [
      event('created', agent('claude-b'), { state: 'reported' }, '2026-11-01T09:00:00Z'),
      event('relation_added', agent('claude-b'), { kind: 'duplicates' }),
      event('evidence_added', agent('claude-b'), { filename: 'noon.png' }),
    ];
    expect(handoffOf(events)).toEqual({
      who: 'claude-b',
      agent: 'claude-b',
      says: 'claude-b created it',
      at: '2026-11-01T09:00:00Z',
      note: null,
    });
  });

  it('is the last move, with the reason it carried', () => {
    const events = [
      event('created', agent('claude-a'), { state: 'todo' }),
      event('transitioned', agent('claude-a'), { from: 'todo', to: 'in_progress' }),
      event(
        'transitioned',
        agent('claude-b'),
        { from: 'in_progress', to: 'review', reason: 'Rigged, see the clip' },
        '2026-11-01T11:00:00Z',
      ),
      event('updated', agent('claude-a'), { changes: {} }),
    ];
    expect(handoffOf(events)).toEqual({
      who: 'claude-b',
      agent: 'claude-b',
      says: 'claude-b moved it to review',
      at: '2026-11-01T11:00:00Z',
      note: 'Rigged, see the clip',
    });
  });

  it('a relayed decision is the agent that relayed it, quoting you', () => {
    const events = [
      event('created', agent('claude-a'), { state: 'todo' }),
      event('transitioned', human, {
        from: 'todo',
        to: 'discarded',
        reason: 'later',
        quote: 'after the art pass',
        via: 'claude-a',
      }),
    ];
    expect(handoffOf(events)).toMatchObject({
      who: 'claude-a',
      agent: 'claude-a',
      says: 'claude-a relayed your move to discarded',
      note: 'after the art pass',
    });
  });

  it('a move you made here is yours, without a mark', () => {
    const events = [
      event('transitioned', human, { from: 'reported', to: 'accepted', channel: 'ui' }),
    ];
    expect(handoffOf(events)).toMatchObject({
      who: 'you',
      agent: null,
      says: 'you moved it to accepted',
    });
  });

  it('is nothing for an item without a creation or a move', () => {
    expect(handoffOf([event('updated', agent('claude-a'), { changes: {} })])).toBeNull();
    expect(handoffOf([])).toBeNull();
  });
});

describe('agoLabel', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  it.each([
    ['2026-11-01T11:59:40Z', 'just now'],
    ['2026-11-01T11:46:00Z', '14m ago'],
    ['2026-11-01T09:00:00Z', '3h ago'],
    ['2026-10-31T10:00:00Z', 'yesterday'],
    ['2026-10-27T10:00:00Z', '5d ago'],
  ])('%s is %s', (iso, label) => {
    expect(agoLabel(iso, now)).toBe(label);
  });
});

describe('waitingChildren', () => {
  it('are the children on your turn, in order', () => {
    const relations = [
      related('child', 'PARTS-1', 'human'),
      related('child', 'PARTS-2'),
      related('blocked_by', 'BUGS-1', 'human'),
      related('child', 'CREATURES-2', 'human'),
    ];
    expect(waitingChildren(relations).map(({ id: itemId }) => itemId)).toEqual([
      'PARTS-1',
      'CREATURES-2',
    ]);
  });
});

describe('leadRelation', () => {
  it('is the first relation as the detail lists them, children aside', () => {
    const relations = [
      related('child', 'PARTS-1'),
      related('relates', 'BUGS-2'),
      related('duplicates', 'BUGS-1'),
    ];
    expect(leadRelation(relations)).toEqual({ label: 'duplicates', item: relations[2] });
  });

  it('is nothing when there are only children', () => {
    expect(leadRelation([related('child', 'PARTS-1')])).toBeUndefined();
  });
});
