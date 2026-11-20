import { describe, expect, it } from 'vitest';
import {
  arcDash,
  clockOf,
  type FeedEvent,
  feedLines,
  heldLeases,
  leaseLeft,
  leaseRows,
  leftShare,
  mergeFeed,
  shownLines,
  spanOf,
  type TurnOf,
} from './activity.ts';
import type { Item } from './types.ts';

const T = Date.parse('2026-11-03T14:00:00.000Z');
const iso = (minutes: number) => new Date(T + minutes * 60_000).toISOString();
const agent = (name: string) => ({ kind: 'agent', name }) as const;
const you = { kind: 'human', name: 'ana' } as const;

let next = 0;
function ev(
  itemId: string,
  type: string,
  actor: FeedEvent['actor'],
  at: number,
  data = {},
): FeedEvent {
  next += 1;
  return { id: next, itemId, type, actor, at: iso(at), data };
}

const turnOf: TurnOf = (_id, state) => (state === 'review' ? 'human' : 'agent');

function item(id: string, lease: Item['lease']): Item {
  return {
    id,
    collection: 'work',
    type: 'task',
    title: `Title of ${id}`,
    fields: {},
    presetVersion: 1,
    state: 'in_progress',
    turn: 'agent',
    createdAt: iso(-60),
    updatedAt: iso(-1),
    createdBy: you,
    lease,
  };
}

describe('feedLines', () => {
  it('says each event as a short phrase, newest first, in the lane of whoever acted', () => {
    const events = [
      ev('WORK-1', 'claimed', agent('claude-a'), 0, { holder: 'claude-a', expiresAt: iso(15) }),
      ev('WORK-1', 'evidence_added', agent('claude-a'), 2, { filename: 'after.png' }),
      ev('WORK-1', 'transitioned', agent('claude-a'), 3, { from: 'in_progress', to: 'review' }),
      ev('WORK-1', 'released', agent('claude-a'), 3, { holder: 'claude-a', cause: 'handoff' }),
      ev('WORK-1', 'transitioned', you, 4, { from: 'review', to: 'done', channel: 'ui' }),
    ];

    const lines = feedLines(events, turnOf);

    expect(lines.map(({ kind, lane, agent, phrase }) => [kind, lane, agent, phrase])).toEqual([
      ['other', 'you', null, { key: 'activity.closed', state: 'done' }],
      ['handoff', 'you', 'claude-a', { key: 'activity.handed', state: 'review' }],
      ['evidence', 'agent', 'claude-a', { key: 'activity.attached', file: 'after.png' }],
      ['lease', 'agent', 'claude-a', { key: 'activity.claimed', time: '15 min' }],
    ]);
  });

  it('says a stuck item you put back in the queue, or left for an agent, in your lane', () => {
    const lines = feedLines(
      [
        ev('WORK-1', 'released', you, 1, { holder: 'kiln', cause: 'restart' }),
        ev('WORK-2', 'released', you, 2, { holder: 'kiln', cause: 'reassign', next: 'quill' }),
      ],
      turnOf,
    );

    expect(lines.map(({ kind, lane, agent, phrase }) => [kind, lane, agent, phrase])).toEqual([
      ['lease', 'you', null, { key: 'activity.reassigned', agent: 'quill' }],
      ['lease', 'you', null, { key: 'activity.restarted' }],
    ]);
  });

  // P7-R3-1: an agent's set-aside read «soltó», and your Retomar «actualizaste».
  it('says an agent set an item aside for later, and that you took it up again', () => {
    const lines = feedLines(
      [
        ev('WORK-1', 'released', agent('claude-a'), 1, { holder: 'claude-a', cause: 'later' }),
        ev('WORK-1', 'set_aside_lifted', you, 2, { by: 'claude-a', cause: 'resume' }),
        // Lifted by a note, an answer or the order: the line of what you did says it.
        ev('WORK-2', 'set_aside_lifted', you, 3, { by: 'claude-a', cause: 'note', note: 1 }),
      ],
      turnOf,
    );

    expect(lines.map(({ kind, lane, agent, phrase }) => [kind, lane, agent, phrase])).toEqual([
      ['lease', 'you', null, { key: 'activity.resumed' }],
      ['lease', 'agent', 'claude-a', { key: 'activity.setAside' }],
    ]);
  });

  it('keeps a relayed decision in your lane, named after the agent that relayed it', () => {
    const relayed = ev('WORK-1', 'transitioned', you, 1, { to: 'done', via: 'claude-b' });

    expect(feedLines([relayed], turnOf)[0]).toMatchObject({
      lane: 'you',
      relayed: true,
      agent: 'claude-b',
    });
  });

  it('filters by kind and by agent', () => {
    const lines = feedLines(
      [
        ev('WORK-1', 'claimed', agent('claude-a'), 0, { holder: 'claude-a', expiresAt: iso(15) }),
        ev('WORK-2', 'claimed', agent('claude-b'), 1, { holder: 'claude-b', expiresAt: iso(16) }),
        ev('WORK-2', 'updated', agent('claude-b'), 2, { changes: {} }),
      ],
      turnOf,
    );

    expect(shownLines(lines, 'lease', null)).toHaveLength(2);
    expect(shownLines(lines, 'all', 'claude-b')).toHaveLength(2);
    expect(shownLines(lines, 'lease', 'claude-a').map((line) => line.event.itemId)).toEqual([
      'WORK-1',
    ]);
  });
});

describe('heldLeases', () => {
  it('reads the length from the claim and a renewal from an expiry later than the claim', () => {
    const events = [
      ev('WORK-1', 'claimed', agent('claude-a'), -10, { holder: 'claude-a', expiresAt: iso(5) }),
    ];
    const items = [
      item('WORK-1', { holder: 'claude-a', expiresAt: iso(12) }),
      item('WORK-2', { holder: 'claude-b', expiresAt: iso(-1) }),
    ];

    expect(heldLeases(items, events, T)).toEqual([
      {
        holder: 'claude-a',
        item: items[0],
        expiresAt: iso(12),
        ttlMs: 15 * 60_000,
        claimedAt: iso(-10),
        renewedAt: iso(-3),
      },
    ]);
  });

  it('falls back to fifteen minutes when the claim is older than the feed', () => {
    const items = [item('WORK-1', { holder: 'claude-a', expiresAt: iso(4) })];

    expect(heldLeases(items, [], T)).toEqual([
      { holder: 'claude-a', item: items[0], expiresAt: iso(4), ttlMs: 15 * 60_000 },
    ]);
  });
});

describe('lease dial', () => {
  it('drains from one to zero over the lease', () => {
    const lease = { expiresAt: iso(5), ttlMs: 10 * 60_000 };

    expect(leftShare(lease, T)).toBe(0.5);
    expect(leftShare(lease, T + 20 * 60_000)).toBe(0);
  });

  it('says a lease length the way a row says a span', () => {
    expect(spanOf(15 * 60_000)).toBe('15 min');
    expect(spanOf(2 * 3_600_000)).toBe('2 h');
    expect(spanOf(102 * 60_000)).toBe('1 h 42 min');
    expect(spanOf(45_000)).toBe('1 min');
  });

  it('draws the arc as the share of a 12 px circle', () => {
    expect(arcDash(1)).toBe('75.4 75.4');
    expect(arcDash(0.5)).toBe('37.7 75.4');
    expect(arcDash(-1)).toBe('0.0 75.4');
  });
});

describe('leaseRows', () => {
  const stuck = (id: string, holder: string, at: number): Item => ({
    ...item(id, null),
    expiredLease: { holder, expiresAt: iso(at) },
  });

  it('lists the leases held now and the ones that ran out, the expired first, then the soonest', () => {
    const items = [
      item('WORK-1', { holder: 'mender', expiresAt: iso(102) }),
      item('WORK-2', { holder: 'scout', expiresAt: iso(12) }),
      stuck('WORK-3', 'kiln', -12),
      { ...stuck('WORK-4', 'quill', -30), turn: 'human' as const },
    ];
    const rows = leaseRows(items, [], T);
    expect(rows.map((r) => [r.holder, r.item.id, r.expired])).toEqual([
      ['kiln', 'WORK-3', true],
      ['scout', 'WORK-2', false],
      ['mender', 'WORK-1', false],
    ]);
  });

  it('says the time left, "expires soon" under twenty minutes, and "expired" in warn', () => {
    const items = [
      item('WORK-1', { holder: 'mender', expiresAt: iso(102) }),
      item('WORK-2', { holder: 'scout', expiresAt: iso(12) }),
      stuck('WORK-3', 'kiln', -12),
    ];
    const [kiln, scout, mender] = leaseRows(items, [], T);
    if (!kiln || !scout || !mender) throw new Error('three rows');
    expect(leaseLeft(mender, T)).toEqual({ main: '1 h 42 min', sub: 'left', warn: false });
    expect(leaseLeft(scout, T)).toEqual({ main: '12 min', sub: 'soon', warn: false });
    expect(leaseLeft(kiln, T)).toEqual({ main: 'expired', sub: 'unrenewed', warn: true });
  });
});

describe('clockOf', () => {
  it('says the hour and minutes, two digits each', () => {
    expect(clockOf(new Date(2026, 10, 3, 9, 5).getTime())).toBe('09:05');
  });
});

describe('mergeFeed', () => {
  it('appends only events past the last one it holds, keeping the newest', () => {
    const a = ev('WORK-1', 'updated', you, 0);
    const b = ev('WORK-1', 'updated', you, 1);

    expect(mergeFeed([a], [a, b]).map(({ id }) => id)).toEqual([a.id, b.id]);
  });
});

describe('feedLines in words', () => {
  it('says questions, notes and a merge in words, never by their event type', () => {
    const lines = feedLines(
      [
        ev('T-1', 'question_asked', agent('ca'), 1, { question: 1, text: '¿Cuál?' }),
        ev('T-1', 'question_answered', you, 2, { question: 1, text: 'Esa' }),
        ev('T-1', 'note_left', you, 3, { note: 1, text: 'Mira esto' }),
        ev('T-1', 'note_answered', agent('ca'), 4, { note: 1, text: 'Hecho' }),
        ev('T-1', 'merged', agent('ca'), 5, { commit: 'abc1234' }),
        ev('T-1', 'point_proved', agent('ca'), 6, { part: 'pc', point: 'ok', kind: 'file' }),
        ev('T-1', 'something_new', agent('ca'), 7),
      ],
      turnOf,
    );
    expect(lines.map((l) => l.phrase.key)).toEqual([
      'activity.touched',
      'activity.proved',
      'activity.merged',
      'activity.noteAnswered',
      'activity.noteLeft',
      'activity.answered',
      'activity.asked',
    ]);
    for (const l of lines)
      expect(JSON.stringify(l.phrase)).not.toMatch(/question_|note_|point_|something_new/);
  });

  it('keeps the name a move wrote for its step', () => {
    const [line] = feedLines(
      [
        ev('T-1', 'transitioned', agent('ca'), 1, {
          from: 'sa',
          to: 'sx8oakta',
          toName: 'Arreglar',
        }),
      ],
      turnOf,
    );
    expect(line?.phrase).toMatchObject({
      key: 'activity.moved',
      state: 'sx8oakta',
      name: 'Arreglar',
    });
  });
});

describe('a send-back in the feed', () => {
  it('says you sent it back, not that you moved it', () => {
    const [line] = feedLines(
      [
        ev('T-8', 'transitioned', you, 1, {
          from: 'todo__review',
          to: 'todo',
          toName: 'Hacerlo',
          reason: 'Otra vez',
        }),
      ],
      turnOf,
    );
    expect(line?.phrase).toMatchObject({ key: 'activity.sentBack', name: 'Hacerlo' });
  });

  it('says an approval that closes it as closing it', () => {
    const [line] = feedLines(
      [ev('T-8', 'transitioned', you, 1, { from: 'todo__review', to: 'done' })],
      turnOf,
    );
    expect(line?.phrase.key).toBe('activity.closed');
  });

  it('never says a publish that closes a Pedido sent it back', () => {
    const [line] = feedLines(
      [
        ev('PED-1', 'transitioned', you, 1, {
          from: 'sdraft__review',
          to: 'done',
          reason: 'publish',
        }),
      ],
      turnOf,
    );
    expect(line?.phrase.key).toBe('activity.closed');
  });

  // Hacerlo (sdo), then the agent's Integrar (sland): the board's steps in order.
  const rankOf = (_id: string, state: string) =>
    ['sdo', 'sdo__review', 'sland'].indexOf(state.replace(/^done$/, 'x'));

  it('says an approval on to an agent’s step as approving it, even with a note', () => {
    const lines = feedLines(
      [
        ev('CAM-1', 'transitioned', you, 1, { from: 'sdo__review', to: 'sland' }),
        ev('CAM-2', 'transitioned', you, 2, { from: 'sdo__review', to: 'sland', reason: 'Bien' }),
      ],
      turnOf,
      rankOf,
    );
    expect(lines.map((l) => l.phrase.key)).toEqual(['activity.approved', 'activity.approved']);
  });

  it('says a send-back to an earlier step as one', () => {
    const [line] = feedLines(
      [ev('CAM-1', 'transitioned', you, 1, { from: 'sland__review', to: 'sdo', reason: 'No' })],
      turnOf,
      (_id, state) => ['sdo', 'sland', 'sland__review'].indexOf(state),
    );
    expect(line?.phrase.key).toBe('activity.sentBack');
  });
});
