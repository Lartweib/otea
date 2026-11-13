import { describe, expect, it } from 'vitest';
import { ago, NOW, officialType } from '../../derive/fixtures.ts';
import type { ItemEvent, ItemView } from '../../types.ts';
import { boardFactsOf, factsOf, standAgentOf, standOf } from './facts.ts';

const bug = officialType('bug-triage');
let seq = 0;
const ev = (
  type: string,
  actor: ItemEvent['actor'],
  data: Record<string, unknown>,
  minutes: number,
): ItemEvent => ({ id: ++seq, type, actor, at: ago(minutes), data });
const mender = { kind: 'agent', name: 'Mender' } as const;
const you = { kind: 'human', name: 'fede' } as const;

function view(o: Partial<ItemView>): ItemView {
  return {
    id: 'ERR-1',
    collection: 'Errores',
    type: 'bug',
    title: 'Los lobos no cruzan',
    fields: {},
    presetVersion: 3,
    state: 'verify',
    turn: 'human',
    createdAt: ago(900),
    updatedAt: ago(14),
    createdBy: { kind: 'agent', name: 'Scout' },
    lease: null,
    events: [],
    transitions: [],
    relayable: [],
    missing: [],
    evidence: [],
    relations: [],
    ...o,
  };
}

const twoRounds = [
  ev('created', { kind: 'agent', name: 'Scout' }, { state: 'reported' }, 900),
  ev('transitioned', you, { from: 'reported', to: 'accepted' }, 800),
  ev('transitioned', mender, { from: 'accepted', to: 'fixing' }, 700),
  ev('transitioned', mender, { from: 'fixing', to: 'verify', reason: 'Lo probé.' }, 600),
  ev('transitioned', you, { from: 'verify', to: 'fixing', reason: 'El último se queda.' }, 500),
  ev('transitioned', mender, { from: 'fixing', to: 'verify', reason: 'Ya cruzan.' }, 14),
];

describe('what the sheet reads from the item', () => {
  it('counts a send-back from a step no agent handed over yet, at the step it left', () => {
    const events = [
      ev('created', { kind: 'agent', name: 'Scout' }, { state: 'reported' }, 900),
      ev('transitioned', you, { from: 'reported', to: 'needs_info', reason: 'Qué versión' }, 5),
    ];
    const f = factsOf(view({ events, state: 'needs_info', turn: 'agent' }), bug, NOW);
    expect(f.sentBack).toEqual([{ n: 1, at: ago(5), state: 'reported' }]);
  });

  it('does not count an answer to a question as a send-back', () => {
    const events = [
      ...twoRounds.slice(0, 3),
      ev('transitioned', mender, { from: 'fixing', to: 'verify', reason: '¿Las borro?' }, 20),
      ev('transitioned', you, { from: 'verify', to: 'fixing', reason: 'Sí.' }, 5),
    ];
    const f = factsOf(view({ events, state: 'fixing', turn: 'agent' }), bug, NOW);
    expect(f.sentBack).toEqual([]);
  });

  it('reads the agent that handed it, its note, the round and your notes', () => {
    const f = factsOf(view({ events: twoRounds }), bug, NOW);
    expect(f.handed).toEqual({ agent: 'Mender', reason: 'Ya cruzan.', at: ago(14) });
    expect(f.round).toBe(2);
    expect(f.agent).toBe('Mender');
    expect(f.mine).toEqual({ reason: 'El último se queda.', at: ago(500), round: 1 });
    expect(f.visited).toEqual(['reported', 'accepted', 'fixing', 'verify']);
    expect(f.sentBack.map((r) => [r.n, r.at])).toEqual([[1, ago(500)]]);
    expect(f.question).toBe(false);
    expect(f.own).toBe(false);
  });

  it('reads a question from a handoff that ends with a question mark', () => {
    const events = [
      ev('created', you, { state: 'reported' }, 90),
      ev('transitioned', you, { from: 'reported', to: 'needs_info', reason: 'build?' }, 80),
      ev(
        'transitioned',
        mender,
        { from: 'needs_info', to: 'reported', reason: '¿Lo dejamos? ' },
        10,
      ),
    ];
    const f = factsOf(view({ state: 'reported', events, createdBy: you }), bug, NOW);
    expect(f.question).toBe(true);
    // created by you in the initial state, but an agent handed it back: not your own step
    expect(f.own).toBe(false);
  });

  it('reads an agent’s question (otea ask) as what it handed you, and your answer', () => {
    const asks = { question: 1, by: 'kiln', text: '¿Liso o con musgo?', at: ago(6) };
    const asked = factsOf(view({ state: 'sconcept', asks }), undefined, NOW);
    expect(asked.question).toBe(true);
    expect(asked.handed).toEqual({ agent: 'kiln', reason: '¿Liso o con musgo?', at: ago(6) });
    const kiln = { kind: 'agent', name: 'kiln' } as const;
    const events = [
      ev('question_asked', kiln, { question: 1, text: '¿Liso o con musgo?' }, 6),
      ev('question_answered', you, { question: 1, text: 'Con musgo' }, 2),
    ];
    const answered = factsOf(view({ state: 'sconcept', turn: 'agent', events }), undefined, NOW);
    expect(answered.question).toBe(false);
    expect(answered.answered).toEqual({
      reason: 'Con musgo',
      at: ago(2),
      asked: { agent: 'kiln', text: '¿Liso o con musgo?' },
    });
  });

  it('reads your own step: created by you, still where its type starts, nobody handed it', () => {
    const events = [ev('created', you, { state: 'reported' }, 30)];
    expect(factsOf(view({ state: 'reported', events, createdBy: you }), bug, NOW).own).toBe(true);
  });

  it('reads what you answered once the agent has it again', () => {
    const events = [
      ev('transitioned', mender, { from: 'needs_info', to: 'reported', reason: '¿Cuál?' }, 40),
      ev('transitioned', you, { from: 'reported', to: 'needs_info', reason: 'La 412.' }, 20),
    ];
    const f = factsOf(view({ state: 'needs_info', turn: 'agent', events }), bug, NOW);
    expect(f.answered).toEqual({ reason: 'La 412.', at: ago(20) });
  });
});

describe('the standfirst (mock:2670-2678)', () => {
  const base = { agent: 'Mender', round: 1, question: false, own: false, quiet: null };

  it('says who hands it to you, and in which round', () => {
    expect(standOf({ ...base, look: 'yours' })).toEqual({
      key: 'sheet.stand.handed',
      agent: 'Mender',
    });
    expect(standOf({ ...base, look: 'yours', round: 2 })).toEqual({
      key: 'sheet.stand.handedRound',
      agent: 'Mender',
      round: 2,
    });
  });

  it('says a question, your own step, your turn with nobody to name', () => {
    expect(standOf({ ...base, look: 'yours', question: true }).key).toBe('sheet.stand.asks');
    expect(standOf({ ...base, look: 'yours', own: true }).key).toBe('sheet.stand.own');
    expect(standOf({ ...base, look: 'yours', agent: null }).key).toBe('sheet.stand.yours');
  });

  it('says an agent gone quiet, and for how long', () => {
    expect(standOf({ ...base, look: 'stuck', quiet: '12 min' })).toEqual({
      key: 'sheet.stand.stuck',
      agent: 'Mender',
      time: '12 min',
    });
  });

  it('says whom you left a stuck item for', () => {
    expect(standOf({ ...base, look: 'queued', left: true })).toEqual({
      key: 'sheet.stand.left',
      agent: 'Mender',
    });
    expect(standOf({ ...base, look: 'queued', agent: null, left: true }).key).toBe(
      'sheet.stand.waitsAgent',
    );
  });

  it('says waiting, working, its children', () => {
    expect(standOf({ ...base, look: 'queued' }).key).toBe('sheet.stand.waits');
    expect(standOf({ ...base, look: 'queued', agent: null }).key).toBe('sheet.stand.waitsAgent');
    expect(standOf({ ...base, look: 'working', round: 3 }).key).toBe('sheet.stand.workingRound');
    expect(standOf({ ...base, look: 'waiting' }).key).toBe('sheet.stand.kids');
  });

  it('says done, by whom, and discarded', () => {
    expect(standOf({ ...base, look: 'done' }).key).toBe('sheet.stand.doneBy');
    expect(standOf({ ...base, look: 'done', agent: null }).key).toBe('sheet.stand.done');
    expect(standOf({ ...base, look: 'dropped' }).key).toBe('sheet.stand.dropped');
  });
});

describe('who a stuck item waits for once you took it in hand', () => {
  const kiln = { kind: 'agent', name: 'kiln' } as const;
  const before = [
    ev('transitioned', kiln, { from: 'accepted', to: 'fixing' }, 60),
    ev('claimed', kiln, { holder: 'kiln' }, 59),
  ];
  const stuck = (events: ItemEvent[]) =>
    factsOf(view({ state: 'fixing', turn: 'agent', events }), bug, NOW).agent;

  it('waits for the agent you left it for', () => {
    expect(
      stuck([
        ...before,
        ev('released', you, { holder: 'kiln', cause: 'reassign', next: 'quill' }, 1),
      ]),
    ).toBe('quill');
  });

  it('waits for any agent once you put it back in the queue', () => {
    expect(
      stuck([...before, ev('released', you, { holder: 'kiln', cause: 'restart' }, 1)]),
    ).toBeNull();
  });
});

describe('who an item on a board waits for', () => {
  const kiln = { kind: 'agent', name: 'kiln' } as const;
  const board = { agent: null, round: 2 };

  it('keeps the agent you left a stuck item for, over the step’s any agent', () => {
    const item = view({
      state: 'sinv',
      turn: 'agent',
      events: [
        ev('claimed', kiln, { holder: 'kiln' }, 59),
        ev('released', you, { holder: 'kiln', cause: 'reassign', next: 'quill' }, 1),
      ],
    });
    const f = boardFactsOf(factsOf(item, undefined, NOW), item, board, false);
    expect(f).toMatchObject({ agent: 'quill', left: true, round: 2 });
  });

  it('waits for whoever takes the next step, not the agent that handed it on', () => {
    const inv = { kind: 'agent', name: 'inv-a' } as const;
    const item = view({
      state: 'ssum',
      turn: 'agent',
      events: [ev('transitioned', inv, { from: 'sdig', to: 'ssum' }, 5)],
    });
    const read = factsOf(item, undefined, NOW);
    expect(standAgentOf(read, false)).toBe('inv-a');
    expect(standAgentOf(boardFactsOf(read, item, board, false), true)).toBeNull();
    const step = { agent: 'mender', round: 1 };
    expect(standAgentOf(boardFactsOf(read, item, step, false), true)).toBe('mender');
  });

  it('names the holder, else the step’s agent, once no item was left for anyone', () => {
    const held = view({ turn: 'agent', lease: { holder: 'kiln', expiresAt: ago(-5) } });
    expect(boardFactsOf(factsOf(held, undefined, NOW), held, board, false).agent).toBe('kiln');
    const free = view({ turn: 'agent' });
    const step = { agent: 'mender', round: 1 };
    expect(boardFactsOf(factsOf(free, undefined, NOW), free, step, false)).toMatchObject({
      agent: 'mender',
      left: false,
    });
  });
});
