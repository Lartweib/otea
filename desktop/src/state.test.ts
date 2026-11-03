import { describe, expect, it } from 'vitest';
import {
  badgeText,
  collectionLabel,
  type DeskItem,
  deskAttention,
  grew,
  menuHeader,
  overlayOf,
  surfaceKey,
  tooltip,
} from './state.ts';

const NOW = Date.parse('2026-11-03T10:00:00Z');
const later = new Date(NOW + 60_000).toISOString();
const earlier = new Date(NOW - 60_000).toISOString();

function item(id: string, extra: Partial<DeskItem> = {}): DeskItem {
  return {
    id,
    collection: 'bugs',
    title: `Title ${id}`,
    turn: 'agent',
    updatedAt: '2026-11-03T09:00:00Z',
    lease: null,
    ...extra,
  };
}

describe('deskAttention', () => {
  it('counts what is yours, the agents holding an active lease and the frame, yours first', () => {
    const a = deskAttention(
      [
        item('BUGS-1', { turn: 'human' }),
        item('BUGS-2', { lease: { holder: 'claude-a', expiresAt: later } }),
        item('BUGS-3', { lease: { holder: 'claude-a', expiresAt: later } }),
        item('BUGS-4', { lease: { holder: 'claude-b', expiresAt: later } }),
        item('BUGS-5', { lease: { holder: 'claude-c', expiresAt: earlier } }),
      ],
      ['bugs'],
      NOW,
    );
    expect(a).toMatchObject({ yours: 1, working: true, agents: 2, frame: 'yours-working' });
  });

  it('is idle with nothing yours and no live lease, an expired lease included', () => {
    const a = deskAttention(
      [item('BUGS-1', { lease: { holder: 'claude', expiresAt: earlier } })],
      [],
      NOW,
    );
    expect(a).toMatchObject({ yours: 0, working: false, agents: 0, frame: 'idle' });
  });

  it('keeps the three most recently updated items that are yours', () => {
    const a = deskAttention(
      ['1', '2', '3', '4'].map((n) =>
        item(`BUGS-${n}`, { turn: 'human', updatedAt: `2026-11-0${n}T00:00:00Z` }),
      ),
      [],
      NOW,
    );
    expect(a.recentYours.map((each) => each.id)).toEqual(['BUGS-4', 'BUGS-3', 'BUGS-2']);
  });

  it('counts each collection, an empty one included', () => {
    const a = deskAttention(
      [
        item('BUGS-1', { turn: 'human' }),
        item('ANIM-1', { collection: 'animations', lease: { holder: 'x', expiresAt: later } }),
      ],
      ['bugs', 'animations', 'tasks'],
      NOW,
    );
    expect(a.collections).toEqual([
      { name: 'bugs', yours: 1, working: 0 },
      { name: 'animations', yours: 0, working: 1 },
      { name: 'tasks', yours: 0, working: 0 },
    ]);
  });
});

const state = (yours: number, agents: number) =>
  deskAttention(
    [
      ...Array.from({ length: yours }, (_, i) => item(`Y-${i}`, { turn: 'human' })),
      ...Array.from({ length: agents }, (_, i) =>
        item(`A-${i}`, { lease: { holder: `agent-${i}`, expiresAt: later } }),
      ),
    ],
    [],
    NOW,
  );

describe('the words', () => {
  it('says the state in the tooltip and the menu header, singular and plural by count', () => {
    expect(tooltip(state(3, 1))).toBe('Otea — 3 yours, 1 agent working');
    expect(tooltip(state(3, 0))).toBe('Otea — 3 yours');
    expect(tooltip(state(0, 2))).toBe('Otea — 2 agents working');
    expect(tooltip(state(0, 0))).toBe('Otea — nothing is yours');
    expect(menuHeader(state(3, 1))).toBe('3 yours · 1 agent working');
    expect(menuHeader(state(0, 0))).toBe('Nothing is yours');
  });

  it('labels a collection with its counts in words', () => {
    expect(collectionLabel({ name: 'animations', yours: 1, working: 1 })).toBe(
      'animations · 1 yours · 1 working',
    );
    expect(collectionLabel({ name: 'tasks', yours: 0, working: 0 })).toBe('tasks · nothing yours');
  });
});

describe('overlayOf', () => {
  it('puts yours over working, and nothing when nothing is yours and nobody works', () => {
    expect(overlayOf(state(1, 1))).toEqual({ kind: 'yours', description: '1 item is yours' });
    expect(overlayOf(state(3, 0))).toEqual({ kind: 'yours', description: '3 items are yours' });
    expect(overlayOf(state(0, 1))).toEqual({ kind: 'working', description: 'An agent is working' });
    expect(overlayOf(state(0, 0))).toBeNull();
  });
});

describe('badgeText', () => {
  it('is the count, 99+ past 99, and empty at zero', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(7)).toBe('7');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
});

describe('grew', () => {
  it('is true only when the count of yours goes up', () => {
    expect(grew(undefined, state(1, 0))).toBe(true);
    expect(grew(state(1, 0), state(2, 0))).toBe(true);
    expect(grew(state(2, 0), state(1, 0))).toBe(false);
    expect(grew(state(1, 0), state(1, 3))).toBe(false);
    expect(grew(undefined, state(0, 1))).toBe(false);
  });
});

describe('surfaceKey', () => {
  it('changes with what the surfaces show and not otherwise', () => {
    expect(surfaceKey(state(1, 1))).toBe(surfaceKey(state(1, 1)));
    expect(surfaceKey(state(1, 1))).not.toBe(surfaceKey(state(2, 1)));
    expect(surfaceKey(state(1, 1))).not.toBe(surfaceKey(state(1, 0)));
  });
});
