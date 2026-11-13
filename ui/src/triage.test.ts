import { afterEach, describe, expect, it } from 'vitest';
import type { Linked } from '../../src/core/board/engine.ts';
import { cambios, creatures, errores } from '../../src/core/board/testing.ts';
import { agent, ago, item, moved, NOW, officialType, you } from './derive/fixtures.ts';
import { setLanguage } from './i18n/i18n.ts';
import { approvalWaitWords } from './refusals.ts';
import {
  approvalGate,
  cardFigures,
  cardWords,
  deliveredFields,
  dragIntent,
  dragProgress,
  flightLift,
  HANDOVER,
  handoffOf,
  landArc,
  landOpacity,
  liftOpacity,
  pileLanding,
  pileOf,
  pileSide,
  pileView,
  releaseDirection,
  resist,
  roundEvidence,
  roundOf,
  stampShift,
  swipeAction,
  swipeThreshold,
  throwFade,
  throwTo,
  tiltOf,
  triagePlan,
  triageQueue,
  triCurrent,
  triDecide,
  triNext,
  triPile,
  triReturn,
  triStart,
  triSync,
} from './triage.ts';
import type { Evidence, ItemEvent, Move } from './types.ts';

const done: Move = { to: 'done', by: 'human-ui', reasonRequired: false, turn: 'none' };
const backWithReason: Move = { to: 'todo', by: 'human-ui', reasonRequired: true, turn: 'agent' };
const back: Move = { to: 'todo', by: 'human-ui', reasonRequired: false, turn: 'agent' };
const discard: Move = { to: 'discarded', by: 'human', reasonRequired: true, turn: 'none' };
const ask: Move = { to: 'needs_info', by: 'human', reasonRequired: false, turn: 'human' };

describe('triagePlan with open children', () => {
  const close = {
    to: 'done',
    by: 'human',
    reasonRequired: false,
    turn: 'none',
    closes: 'done',
    requires: ['children_closed'],
  } as Move;
  const rework = { to: 'building', by: 'human', reasonRequired: true, turn: 'agent' } as const;
  const children = { total: 3, open: 2, done: 1, discarded: 0 };
  const waits = { children };

  it('never swipes a move that waits for children, and names it as blocked', () => {
    expect(triagePlan([close, rework], waits)).toEqual({
      back: rework,
      blocked: [{ move: close, note: 'waits for 2 open children' }],
    });
  });

  it('never swipes a working state that waits for children either', () => {
    const review = {
      to: 'review',
      by: 'human',
      reasonRequired: false,
      turn: 'human',
      requires: ['children_closed'],
    } as Move;
    const approve = { to: 'approved', by: 'human', reasonRequired: false, turn: 'agent' } as const;

    expect(triagePlan([review, approve, rework], waits)).toEqual({
      forward: approve,
      back: rework,
      blocked: [{ move: review, note: 'waits for 2 open children' }],
    });
  });

  it('swipes it once every child is closed', () => {
    expect(triagePlan([close, rework], { children: { ...children, open: 0 } })).toEqual({
      forward: close,
      back: rework,
    });
  });
});

describe('triagePlan', () => {
  it('swipes right to the primary move and left to the move that sends the item back to an agent', () => {
    expect(triagePlan([done, backWithReason, discard])).toEqual({
      forward: done,
      back: backWithReason,
    });
  });

  it('never sends back with a move that keeps the turn with you or closes the item', () => {
    expect(triagePlan([done, ask, discard])).toEqual({ forward: done });
  });

  it('has no forward when no move is primary', () => {
    expect(triagePlan([backWithReason, discard])).toEqual({ back: backWithReason });
  });

  it('does not use the forward move as the way back when it also hands the turn to an agent', () => {
    const ship: Move = { to: 'deploy', by: 'human', reasonRequired: false, turn: 'agent' };
    expect(triagePlan([ship, backWithReason])).toEqual({ forward: ship, back: backWithReason });
    expect(triagePlan([ship])).toEqual({ forward: ship });
  });
});

describe('swipeAction', () => {
  it('performs the primary move on a right swipe', () => {
    expect(swipeAction('right', { forward: done, back })).toEqual({ kind: 'move', to: 'done' });
  });

  it('performs the send-back move on a left swipe when it needs no reason', () => {
    expect(swipeAction('left', { forward: done, back })).toEqual({ kind: 'move', to: 'todo' });
  });

  it('asks for the reason instead of moving when the send-back move requires one', () => {
    expect(swipeAction('left', { forward: done, back: backWithReason })).toEqual({
      kind: 'explain',
      to: 'todo',
    });
  });

  it('never performs a move that requires a reason, whichever the direction', () => {
    const forward = { ...done, reasonRequired: true };
    expect(swipeAction('right', { forward })).toEqual({ kind: 'explain', to: 'done' });
  });

  it('does nothing in a direction with no move', () => {
    expect(swipeAction('right', { back })).toEqual({ kind: 'none' });
    expect(swipeAction('left', { forward: done })).toEqual({ kind: 'none' });
  });
});

describe('dragIntent', () => {
  it('waits until the pointer has moved past the slop', () => {
    expect(dragIntent(4, 3)).toBe('pending');
  });

  it('drags when the motion is mostly sideways, and leaves vertical motion to scrolling', () => {
    expect(dragIntent(14, 4)).toBe('drag');
    expect(dragIntent(-14, 4)).toBe('drag');
    expect(dragIntent(4, 14)).toBe('scroll');
    expect(dragIntent(10, -12)).toBe('scroll');
  });
});

describe('swipeThreshold', () => {
  it('is a third of the card, kept between 80 and 160 pixels', () => {
    expect(swipeThreshold(330)).toBe(99);
    expect(swipeThreshold(150)).toBe(80);
    expect(swipeThreshold(900)).toBe(160);
  });
});

describe('releaseDirection', () => {
  const width = 330;

  it('commits once the card is dragged past the threshold', () => {
    expect(releaseDirection({ dx: 100, vx: 0, width })).toBe('right');
    expect(releaseDirection({ dx: -120, vx: 0, width })).toBe('left');
  });

  it('snaps back when released before the threshold', () => {
    expect(releaseDirection({ dx: 60, vx: 0.1, width })).toBeUndefined();
    expect(releaseDirection({ dx: -98, vx: 0, width })).toBeUndefined();
  });

  it('commits a quick flick that has travelled far enough', () => {
    expect(releaseDirection({ dx: 48, vx: 0.8, width })).toBe('right');
    expect(releaseDirection({ dx: -48, vx: -0.8, width })).toBe('left');
  });

  it('ignores a flick that is too short or runs against the drag', () => {
    expect(releaseDirection({ dx: 20, vx: 1.2, width })).toBeUndefined();
    expect(releaseDirection({ dx: 60, vx: -0.9, width })).toBeUndefined();
  });
});

describe('dragProgress', () => {
  it('rises from 0 to 1 as the card nears the threshold, in either direction', () => {
    expect(dragProgress(0, 330)).toBe(0);
    expect(dragProgress(-49.5, 330)).toBe(0.5);
    expect(dragProgress(300, 330)).toBe(1);
  });
});

describe('the pass (triStart, triSync, triDecide)', () => {
  it('starts on the first card, nothing decided', () => {
    const s = triStart(['A', 'B', 'C']);
    expect(triCurrent(s)).toBe('A');
    expect(triNext(s)).toBe('B');
    expect(s.decided).toBe(0);
  });

  it('approving or sending back moves on and counts a decision', () => {
    const s = triDecide(triDecide(triStart(['A', 'B', 'C']), 'approve'), 'send');
    expect(triCurrent(s)).toBe('C');
    expect(s.decided).toBe(2);
  });

  it('Later sends the card to the end of the pass without deciding it', () => {
    const s = triDecide(triStart(['A', 'B', 'C']), 'later');
    expect(s.q).toEqual(['B', 'C', 'A']);
    expect(triCurrent(s)).toBe('B');
    expect(s.decided).toBe(0);
  });

  it('Later on the last card shows it again', () => {
    const s = triDecide(triStart(['A']), 'later');
    expect(triCurrent(s)).toBe('A');
  });

  it('ends once every card was decided', () => {
    const s = triDecide(triDecide(triStart(['A', 'B']), 'approve'), 'approve');
    expect(triCurrent(s)).toBeUndefined();
    expect(triNext(s)).toBeUndefined();
  });

  it('a new review joins the end of the pass', () => {
    const s = triSync(triStart(['A', 'B']), ['A', 'B', 'C']);
    expect(s.q).toEqual(['A', 'B', 'C']);
  });

  it('a card still to come that left the reviews (moved elsewhere) drops out', () => {
    const s = triSync(triDecide(triStart(['A', 'B', 'C']), 'approve'), ['C']);
    expect(s.q).toEqual(['A', 'C']);
    expect(triCurrent(s)).toBe('C');
  });

  it('keeps the same pass when nothing changed', () => {
    const s = triStart(['A', 'B']);
    expect(triSync(s, ['B', 'A'])).toBe(s);
  });
});

describe('triageQueue', () => {
  const bug = officialType('bug-triage');
  const ctx = (feed = [] as ReturnType<typeof moved>[]) => ({ now: NOW, feed, types: () => bug });

  it('lists the reviews, the one waiting longest first', () => {
    const items = [
      item({ id: 'B', state: 'verify', updatedAt: ago(10) }),
      item({ id: 'A', state: 'verify', updatedAt: ago(90) }),
      item({ id: 'X', state: 'fixing', turn: 'agent' }),
    ];
    expect(triageQueue(items, ctx())).toEqual(['A', 'B']);
  });

  it('leaves out questions and your own steps', () => {
    const items = [
      item({ id: 'Q', state: 'reported' }),
      item({ id: 'O', state: 'reported', createdBy: { kind: 'human', name: 'you' } }),
      item({ id: 'R', state: 'verify' }),
    ];
    const feed = [moved('Q', 'reported', agent('scout'), { reason: '¿Lo dejamos?' })];
    expect(triageQueue(items, ctx(feed))).toEqual(['R']);
  });
});

describe('roundOf', () => {
  it('is the first round until you send the item back with notes', () => {
    expect(roundOf('A', [])).toBe(1);
  });

  it('adds a round for every time you sent it back with notes', () => {
    const feed = [
      moved('A', 'fixing', you, { reason: 'falta el anclaje' }),
      moved('A', 'verify', agent('mender')),
      moved('A', 'fixing', you, { reason: 'otra vez' }),
      moved('B', 'fixing', you, { reason: 'no es este' }),
      moved('A', 'verify', you),
    ];
    expect(roundOf('A', feed)).toBe(3);
  });
});

describe('cardWords', () => {
  it('names the agent that hands it to you, its words and the round', () => {
    const it0 = item({ id: 'A', state: 'verify' });
    const feed = [
      moved('A', 'fixing', you, { reason: 'falta' }),
      moved('A', 'verify', agent('mender'), { reason: 'Ya cruzan.' }),
    ];
    expect(cardWords(it0, feed)).toEqual({ agent: 'mender', say: 'Ya cruzan.', round: 2 });
  });

  it('has no agent when nobody handed it over', () => {
    expect(cardWords(item({ id: 'A' }), [])).toEqual({ agent: null, say: '', round: 1 });
  });
});

describe('tiltOf', () => {
  it('tilts the card with the pull, never past a slight 3 degrees', () => {
    expect(tiltOf(0)).toBe(0);
    expect(tiltOf(100)).toBe(1);
    expect(tiltOf(-150)).toBe(-1.5);
    expect(tiltOf(900)).toBe(3);
    expect(tiltOf(-900)).toBe(-3);
  });
});

describe('resist', () => {
  it('follows the pointer toward a side that has a move', () => {
    expect(resist(120, true)).toBe(120);
    expect(resist(-80, true)).toBe(-80);
  });

  it('gives only a little toward a side with no move, like a rubber band', () => {
    expect(resist(50, false)).toBe(10);
    expect(resist(-50, false)).toBe(-10);
    expect(resist(600, false)).toBe(28);
    expect(resist(-600, false)).toBe(-28);
  });
});

describe('throwTo', () => {
  it('throws the card on past where it was let go, to its side', () => {
    expect(throwTo('right', 160)).toBe(300);
    expect(throwTo('left', -130)).toBe(-270);
  });

  it('throws a card decided by a button (not dragged) a fixed way', () => {
    expect(throwTo('right', 0)).toBe(220);
    expect(throwTo('left', 0)).toBe(-220);
  });
});

describe('throwFade', () => {
  it('keeps the card whole while it leaves, then lets it go before it lands', () => {
    expect(throwFade(0)).toBe(1);
    expect(throwFade(0.2)).toBe(1);
    expect(throwFade(0.5)).toBeGreaterThan(0);
    expect(throwFade(0.5)).toBeLessThan(1);
    expect(throwFade(0.85)).toBe(0);
    expect(throwFade(1)).toBe(0);
  });

  it('never comes back once fading', () => {
    let last = 1;
    for (let k = 0; k <= 1; k += 0.05) {
      expect(throwFade(k)).toBeLessThanOrEqual(last);
      last = throwFade(k);
    }
  });
});

describe('stampShift', () => {
  // A phone: 390 wide, the card 16 to 374, the stamp 150 wide.
  const view = 390;
  const card = { left: 16, width: 358 };

  it('leaves the stamp where it is while it is on the screen', () => {
    expect(stampShift('right', { at: 20, width: 150 }, card, 100, view)).toBe(0);
    expect(stampShift('left', { at: 188, width: 150 }, card, -100, view)).toBe(0);
  });

  it('keeps the approve stamp on the screen as the card is pulled off to the right', () => {
    // 16 + 20 + 200 + 150 = 386, past 390 - 10 by 6.
    expect(stampShift('right', { at: 20, width: 150 }, card, 200, view)).toBe(-6);
  });

  it('keeps the send-back stamp on the screen as the card is pulled off to the left', () => {
    // 16 + 188 - 200 = 4, short of 10 by 6.
    expect(stampShift('left', { at: 188, width: 150 }, card, -200, view)).toBe(6);
  });

  it('never moves the stamp off its card', () => {
    expect(stampShift('right', { at: 20, width: 150 }, card, 340, view)).toBe(-14);
    expect(stampShift('left', { at: 188, width: 150 }, card, -340, view)).toBe(14);
  });
});

describe('triReturn and a decision taken back', () => {
  it('brings a decided card back on top, undecided', () => {
    const s = triDecide(triDecide(triStart(['A', 'B', 'C']), 'approve'), 'send');
    const r = triReturn(s, 'A');
    expect(r.q).toEqual(['B', 'A', 'C']);
    expect(triCurrent(r)).toBe('A');
    expect(r.decided).toBe(1);
  });

  it('leaves the pass as it is for a card not decided', () => {
    const s = triDecide(triStart(['A', 'B']), 'approve');
    expect(triReturn(s, 'B')).toBe(s);
    expect(triReturn(s, 'Z')).toBe(s);
  });

  it('a decided card that left the reviews and comes back (Deshacer) returns on top', () => {
    const decided = triDecide(triStart(['A', 'B', 'C']), 'approve');
    const left = triSync(decided, ['B', 'C']);
    expect(left.gone).toEqual(['A']);
    expect(triCurrent(left)).toBe('B');
    const back = triSync(left, ['A', 'B', 'C']);
    expect(triCurrent(back)).toBe('A');
    expect(back.decided).toBe(0);
    expect(back.gone).toEqual([]);
  });

  it('a decided card still listed while its move lands is not brought back', () => {
    const decided = triDecide(triStart(['A', 'B']), 'approve');
    const s = triSync(decided, ['A', 'B']);
    expect(triCurrent(s)).toBe('B');
    expect(s.decided).toBe(1);
  });
});

describe('the piles (which pile a move goes to, and what each holds)', () => {
  it('an approval goes on the approved pile, a send-back on the sent-back one, Later on none', () => {
    expect(pileOf('approve')).toBe('approved');
    expect(pileOf('send')).toBe('sent');
    expect(pileOf('later')).toBeUndefined();
  });

  it('each pile sits on the side its card is thrown to: approved right, sent back left', () => {
    expect(pileSide('approved')).toBe('right');
    expect(pileSide('sent')).toBe('left');
  });

  it('a pass starts with both piles empty', () => {
    const s = triStart(['A', 'B']);
    expect(triPile(s, 'approved')).toEqual([]);
    expect(triPile(s, 'sent')).toEqual([]);
  });

  it('a decided card lands on its pile with the step it went to, newest on top', () => {
    let s = triStart(['A', 'B', 'C', 'D', 'E']);
    s = triDecide(s, 'approve', 'done');
    s = triDecide(s, 'send', 'todo');
    s = triDecide(s, 'approve', 'done');
    s = triDecide(s, 'later');
    s = triDecide(s, 'approve', 'shipped');
    expect(triPile(s, 'approved')).toEqual([
      { id: 'E', pile: 'approved', to: 'shipped' },
      { id: 'C', pile: 'approved', to: 'done' },
      { id: 'A', pile: 'approved', to: 'done' },
    ]);
    expect(triPile(s, 'sent')).toEqual([{ id: 'B', pile: 'sent', to: 'todo' }]);
  });

  it('the piles count what was decided, never what was left for later', () => {
    let s = triStart(['A', 'B', 'C']);
    s = triDecide(s, 'approve', 'done');
    s = triDecide(s, 'later');
    s = triDecide(s, 'send', 'todo');
    expect(triPile(s, 'approved').length + triPile(s, 'sent').length).toBe(s.decided);
  });

  it('a card taken back (Deshacer, a failed move) leaves its pile', () => {
    let s = triStart(['A', 'B', 'C']);
    s = triDecide(s, 'approve', 'done');
    s = triDecide(s, 'send', 'todo');
    const r = triReturn(s, 'A');
    expect(triPile(r, 'approved')).toEqual([]);
    expect(triPile(r, 'sent')).toEqual([{ id: 'B', pile: 'sent', to: 'todo' }]);
  });

  it('a card that left the reviews and comes back leaves its pile too', () => {
    const decided = triDecide(triStart(['A', 'B']), 'send', 'todo');
    const left = triSync(decided, ['B']);
    expect(triPile(left, 'sent')).toHaveLength(1);
    const back = triSync(left, ['A', 'B']);
    expect(triPile(back, 'sent')).toEqual([]);
  });
});

describe('pileView', () => {
  const entries = ['F', 'E', 'D', 'C', 'B', 'A'].map((id) => ({
    id,
    pile: 'approved' as const,
    to: 'done',
  }));

  it('shows a short pile whole', () => {
    expect(pileView(entries.slice(0, 3), 5)).toEqual({ shown: entries.slice(0, 3), more: 0 });
  });

  it('shows the newest of a tall pile and counts the rest under them', () => {
    expect(pileView(entries, 4)).toEqual({ shown: entries.slice(0, 4), more: 2 });
  });
});

describe('pileLanding', () => {
  const card = { left: 500, top: 200, width: 760, height: 400 };
  const pile = { left: 1300, top: 240, width: 260, height: 0 };

  it('brings the card down to the pile width, its top on the pile top', () => {
    const at = pileLanding(card, pile);
    expect(at.scale).toBeCloseTo(260 / 760);
    // Centres line up: 500 + 380 + x = 1300 + 130.
    expect(at.x).toBeCloseTo(550);
    // The scaled card's top on the pile's top: 200 + 200 + y - 200 * scale = 240.
    expect(at.y).toBeCloseTo(240 - 400 + 200 * (260 / 760));
  });

  it('lands to the left for a pile on the left', () => {
    const at = pileLanding(card, { left: 140, top: 240, width: 260, height: 0 });
    expect(at.x).toBeLessThan(0);
  });

  it('never grows a card onto a pile wider than it', () => {
    expect(pileLanding(card, { ...pile, width: 900 }).scale).toBe(1);
  });
});

describe('the handover between a flying card and its pile entry', () => {
  const T = 560;

  it('keeps a landing card fully opaque until its last 80 ms', () => {
    expect(HANDOVER).toBe(80);
    expect(landOpacity(0, T)).toBe(1);
    expect(landOpacity(0.5, T)).toBe(1);
    expect(landOpacity((T - HANDOVER) / T, T)).toBe(1);
  });

  it('crossfades out over the last 80 ms, gone as it sits on its entry', () => {
    const mid = landOpacity((T - HANDOVER / 2) / T, T);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(landOpacity(1, T)).toBe(0);
  });

  it('a card taken back off its pile is the landing reversed: opaque after its first 80 ms', () => {
    for (const k of [0, 0.05, 0.1, 0.143, 0.3, 0.9, 1]) {
      expect(liftOpacity(k, T)).toBeCloseTo(landOpacity(1 - k, T));
    }
    expect(liftOpacity(0, T)).toBe(0);
    expect(liftOpacity(HANDOVER / T, T)).toBe(1);
  });

  it('lifts the card off the stack at once and keeps it lifted while it flies', () => {
    expect(flightLift(0, T)).toBe(0);
    expect(flightLift(HANDOVER / T, T)).toBe(1);
    expect(flightLift(0.5, T)).toBe(1);
  });

  it('a card already held (dragged) flies on lifted from its first frame', () => {
    expect(flightLift(0, T, 1)).toBe(1);
  });

  it('settles it flat only as it lands', () => {
    expect(flightLift((T - HANDOVER) / T, T)).toBe(1);
    expect(flightLift(1, T)).toBe(0);
  });

  it('carries the card over the pile heading: no rise at either end, the most halfway', () => {
    expect(landArc(0)).toBe(0);
    expect(landArc(1)).toBeCloseTo(0);
    expect(landArc(0.5)).toBeGreaterThan(landArc(0.25));
    expect(landArc(0.5)).toBeGreaterThan(landArc(0.75));
    expect(landArc(0.5)).toBeGreaterThan(0);
  });
});

// ---- what a card shows of the round under review (the current round, what it delivered) ----

let eid = 100;
const ev = (
  type: string,
  at: string,
  data: Record<string, unknown>,
  actor: ItemEvent['actor'] = { kind: 'agent', name: 'kiln' },
): ItemEvent => ({ id: ++eid, type, actor, at, data });
const proof = (id: number, at: string, o: Partial<Evidence> = {}): Evidence => ({
  id,
  itemId: 'C-1',
  role: 'single',
  module: 'eart',
  kind: 'image',
  filename: `f${id}.png`,
  contentType: 'image/png',
  size: 1,
  sha256: '',
  caption: null,
  createdAt: at,
  actor: { kind: 'agent', name: 'kiln' },
  channel: 'cli',
  ...o,
});
const T = (h: number) => `2026-01-01T${String(h).padStart(2, '0')}:00:00Z`;

describe('roundEvidence: the files of the round under review', () => {
  it('keeps only what came after the step’s round began, never an earlier round’s', () => {
    const view = {
      state: 'sfix__review',
      createdAt: T(0),
      events: [
        ev('created', T(0), { state: 'sfix' }, you),
        ev('transitioned', T(2), { from: 'sfix', to: 'sfix__review' }),
        ev('transitioned', T(3), { from: 'sfix__review', to: 'sfix', reason: 'otra' }, you),
        ev('transitioned', T(5), { from: 'sfix', to: 'sfix__review' }),
      ],
      evidence: [proof(1, T(1)), proof(2, T(4))],
    };
    expect(roundEvidence(view).map((e) => e.id)).toEqual([2]);
  });

  it('never shows an earlier step’s files on a later step’s review', () => {
    const view = {
      state: 'sfinal__review',
      createdAt: T(0),
      events: [
        ev('created', T(0), { state: 'ssketch' }, you),
        ev('transitioned', T(2), { from: 'ssketch', to: 'ssketch__review' }),
        ev('transitioned', T(3), { from: 'ssketch__review', to: 'sfinal' }, you),
        ev('transitioned', T(5), { from: 'sfinal', to: 'sfinal__review' }),
      ],
      evidence: [proof(1, T(1)), proof(2, T(4))],
    };
    expect(roundEvidence(view).map((e) => e.id)).toEqual([2]);
  });

  it('keeps, with the board read, only the files the step hands in (not its references)', () => {
    const def = creatures();
    const view = {
      state: 'sconcept__review',
      createdAt: T(0),
      events: [
        ev('created', T(0), { state: 'sconcept' }, you),
        ev('transitioned', T(5), { from: 'sconcept', to: 'sconcept__review' }),
      ],
      evidence: [proof(1, T(1), { module: 'eref' }), proof(2, T(4), { module: 'eart' })],
    };
    expect(roundEvidence(view, def).map((e) => e.id)).toEqual([2]);
  });

  it('keeps every file of an item whose states are not a board’s steps', () => {
    const view = {
      state: 'verify',
      createdAt: T(0),
      events: [ev('transitioned', T(5), { from: 'fixing', to: 'verify' })],
      evidence: [proof(1, T(1)), proof(2, T(4))],
    };
    expect(roundEvidence(view).map((e) => e.id)).toEqual([1, 2]);
  });
});

describe('cardFigures: the images a card shows', () => {
  it('shows the newest two, newest first', () => {
    const shown = cardFigures([proof(1, T(1)), proof(2, T(2)), proof(3, T(3))]);
    expect(shown.map((e) => e.id)).toEqual([3, 2]);
  });

  it('shows the newest before and the newest after, in that order', () => {
    const shown = cardFigures([
      proof(1, T(1), { role: 'before' }),
      proof(2, T(2), { role: 'after' }),
      proof(3, T(3), { role: 'before' }),
      proof(4, T(4), { role: 'after' }),
      proof(5, T(5)),
    ]);
    expect(shown.map((e) => e.id)).toEqual([3, 4]);
  });

  it('leaves out what is not an image', () => {
    expect(cardFigures([proof(1, T(1), { contentType: 'text/x-diff' })])).toEqual([]);
  });
});

describe('handoffOf: who handed the round in, and its note', () => {
  it('reads the handoff’s note, which a board keeps apart from the reason', () => {
    const view = {
      state: 'sfix__review',
      events: [
        ev('transitioned', T(2), { from: 'sfix', to: 'sfix__review', note: 'Viejo.' }),
        ev('transitioned', T(3), { from: 'sfix__review', to: 'sfix', reason: 'otra' }, you),
        ev('transitioned', T(5), { from: 'sfix', to: 'sfix__review', note: ' Ya cruzan. ' }),
      ],
    };
    expect(handoffOf(view)).toEqual({ agent: 'kiln', note: 'Ya cruzan.' });
  });

  it('reads the reason when the move carries no note, and nothing when you moved it', () => {
    const said = {
      state: 'verify',
      events: [ev('transitioned', T(1), { to: 'verify', reason: 'Listo.' })],
    };
    expect(handoffOf(said)).toEqual({ agent: 'kiln', note: 'Listo.' });
    const mine = { state: 'verify', events: [ev('transitioned', T(1), { to: 'verify' }, you)] };
    expect(handoffOf(mine)).toBeNull();
  });
});

describe('deliveredFields: the fields the step hands in, with their values', () => {
  it('lists the step’s handed fields that hold a value, by their names', () => {
    const def = cambios();
    const view = { state: 'sanalyse__review', fields: { fplan: 'Tres pasos.', fwhat: 'x' } };
    expect(deliveredFields(def, view, (_f, v) => v)).toEqual([
      { ref: 'fplan', name: 'Plan', value: 'Tres pasos.' },
    ]);
    expect(deliveredFields(def, { ...view, fields: { fplan: ' ' } }, (_f, v) => v)).toEqual([]);
  });

  it('says a choice in its words', () => {
    const view = { state: 'striage__review', fields: { fcat: 'cgame' } };
    expect(deliveredFields(errores(), view, (f, v) => `${f}:${v}`)).toEqual([
      { ref: 'fcat', name: 'Categoría', value: 'fcat:cgame' },
    ]);
  });
});

describe('approvalGate: why Aprobar waits, before it is tried', () => {
  const open = { id: 'TAR-6', board: 'Tareas de repo', step: 'Implementar', closed: false };
  const done = { id: 'TAR-5', board: 'Tareas de repo', closed: true };
  const block = (parts: Linked[]) => ({
    parts,
    partsBoard: 'Tareas de repo',
    blockers: [],
    blocking: [],
    notes: [],
    gates: null,
    branch: null,
  });

  it('holds the approvals of a review whose step waits for a part still open', () => {
    const gate = approvalGate(cambios(), { state: 'sexec__review', board: block([done, open]) });
    expect(gate?.to).toEqual(['done']);
    expect(gate?.missing).toEqual([
      {
        ref: 'wait:parts',
        name: 'Tareas de repo',
        reason: 'open',
        fresh: false,
        open: [open],
        total: 2,
      },
    ]);
  });

  it('holds nothing once the parts are finished, or on a step that waits for none', () => {
    const finished = { state: 'sexec__review', board: block([done]) };
    expect(approvalGate(cambios(), finished)).toBeUndefined();
    const other = { state: 'sanalyse__review', board: block([open]) };
    expect(approvalGate(cambios(), other)).toBeUndefined();
  });
});

describe('triagePlan with a gate', () => {
  const next: Move = { to: 'done', by: 'human', reasonRequired: false, turn: 'none' };
  const sendBack: Move = { to: 'sexec', by: 'human', reasonRequired: true, turn: 'agent' };

  it('never swipes an approval the board would refuse, and says why', () => {
    const gate = { to: ['done'], note: 'TAR-6 sigue sin terminar' };
    expect(triagePlan([next, sendBack], {}, gate)).toEqual({
      back: sendBack,
      blocked: [{ move: next, note: 'TAR-6 sigue sin terminar' }],
    });
  });
});

describe('approvalWaitWords: the gate in the language on screen', () => {
  afterEach(() => setLanguage('en'));

  it('says the part is still not finished, never that it was reopened', () => {
    const missing = [
      {
        ref: 'wait:parts',
        name: 'Tareas de repo',
        reason: 'open' as const,
        fresh: false,
        open: [{ id: 'TAR-6', board: 'Tareas de repo', step: 'Implementar', closed: false }],
        total: 1,
      },
    ];
    setLanguage('es');
    expect(approvalWaitWords(missing)).toBe(
      'Aún no se puede aprobar: su parte TAR-6 (Implementar) sigue sin terminar.',
    );
    setLanguage('en');
    expect(approvalWaitWords(missing)).toBe(
      'Not approvable yet: its part TAR-6 (Implementar) is not finished.',
    );
  });
});
