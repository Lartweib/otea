import { describe, expect, it } from 'vitest';
import type { Actor } from '../item.ts';
import { modelFamily, type Profile } from '../profile.ts';
import type { HistoryEvent } from './history.ts';
import {
  type ItemTrail,
  modelPerformance,
  type PerformanceEvent,
  parsePeriod,
} from './performance.ts';
import { creatures } from './testing.ts';

// Criaturas: Concepto (any agent, you review) → Animar (kiln does, scout reviews) → Pulir (you).
const def = creatures();

const you: Actor = { kind: 'human', name: 'fede' };
const quill: Actor = { kind: 'agent', name: 'quill' };
const kiln: Actor = { kind: 'agent', name: 'kiln' };

const profiled = (profile: Profile) => ({ ...profile, family: modelFamily(profile.model) });
const SONNET = profiled({ harness: 'claude-code', model: 'claude-sonnet-5', effort: 'medium' });
const OPUS = profiled({ harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high' });
const OPUS_OLD = profiled({ harness: 'claude-code', model: 'claude-opus-4-1', effort: 'high' });

let id = 0;
let minute = 0;
const later = (minutes = 1) => {
  minute += minutes;
  return new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();
};

type Who = { actor: Actor; profile?: PerformanceEvent['profile'] };
const AGENT = (actor: Actor, profile: PerformanceEvent['profile']): Who => ({ actor, profile });
const YOU: Who = { actor: you };

function event(type: string, data: Record<string, unknown>, who: Who, minutes = 1) {
  id += 1;
  const e: PerformanceEvent = { id, type, actor: who.actor, at: later(minutes), data };
  if (who.profile) e.profile = who.profile;
  return e;
}

const created = (state = 'sconcept') => event('created', { state }, YOU, 0);
const claim = (who: Who, minutes = 1) => event('claimed', { holder: who.actor.name }, who, minutes);
const move = (from: string, to: string, who: Who, more: Record<string, unknown> = {}, m = 1) =>
  event('transitioned', { from, to, ...more }, who, m);

function trail(item: string, events: PerformanceEvent[], board = 'Criaturas'): ItemTrail {
  return {
    item,
    board,
    def,
    events,
    start: { initial: 'sconcept', createdAt: events[0]?.at ?? '' },
  };
}

const sonnet = AGENT(quill, SONNET);
const opus = AGENT(kiln, OPUS);

describe('modelPerformance', () => {
  it('counts a handoff sent back and a step finished in its second round for the profile on the handoff', () => {
    const events = [
      created(),
      claim(sonnet),
      move('sconcept', 'sconcept__review', sonnet, {}, 10),
      move('sconcept__review', 'sconcept', YOU, { reason: 'Más barro' }),
      claim(sonnet),
      move('sconcept', 'sconcept__review', sonnet, {}, 20),
      move('sconcept__review', 'sanimate', YOU),
    ];

    const report = modelPerformance([trail('CRI-1', events)]);

    expect(report.rows).toHaveLength(1);
    const [row] = report.rows;
    expect(row).toMatchObject({
      family: 'sonnet',
      effort: 'medium',
      handoffs: 2,
      sentBack: 1,
      finishedSteps: 1,
      rounds: 2,
      itemsFinished: 0,
      discards: 0,
      medianClaimToHandoffMs: 15 * 60_000,
    });
    expect(row?.models).toEqual([
      expect.objectContaining({ model: 'claude-sonnet-5', handoffs: 2 }),
    ]);
    expect(row?.steps).toEqual([
      expect.objectContaining({ board: 'Criaturas', step: 'sconcept', stepName: 'Concepto' }),
    ]);
  });

  it('gives each handoff to the profile it carried, and the finished step to the last one', () => {
    const events = [
      created(),
      move('sconcept', 'sconcept__review', sonnet),
      move('sconcept__review', 'sconcept', YOU, { reason: 'No' }),
      move('sconcept', 'sconcept__review', opus),
      move('sconcept__review', 'sanimate', YOU),
    ];

    const { rows } = modelPerformance([trail('CRI-1', events)]);

    const by = (family: string) => rows.find((row) => row.family === family);
    expect(by('sonnet')).toMatchObject({ handoffs: 1, sentBack: 1, finishedSteps: 0 });
    expect(by('opus')).toMatchObject({ handoffs: 1, sentBack: 0, finishedSteps: 1, rounds: 2 });
  });

  it('groups exact models of one family and effort, and tells them apart in the drill-down', () => {
    const one = [created(), move('sconcept', 'sconcept__review', opus)];
    const two = [created(), move('sconcept', 'sconcept__review', AGENT(kiln, OPUS_OLD))];

    const { rows } = modelPerformance([trail('CRI-1', one), trail('CRI-2', two)]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.handoffs).toBe(2);
    expect(rows[0]?.models.map(({ model }) => model).sort()).toEqual([
      'claude-opus-4-1',
      'claude-opus-5-5',
    ]);
  });

  it('counts a send-back from a later step against the step it returns to', () => {
    const events = [
      created(),
      move('sconcept', 'sconcept__review', sonnet),
      move('sconcept__review', 'sanimate', YOU),
      move('sanimate', 'sanimate__review', opus),
      move('sanimate__review', 'sconcept', YOU, { reason: 'El concepto no sirve' }),
    ];

    const { rows } = modelPerformance([trail('CRI-1', events)]);

    const by = (family: string) => rows.find((row) => row.family === family);
    expect(by('sonnet')).toMatchObject({ handoffs: 1, sentBack: 1, finishedSteps: 0 });
    expect(by('opus')).toMatchObject({ handoffs: 1, sentBack: 0 });
  });

  it('ignores steps the person did, and agents that declared no profile', () => {
    const events = [
      created(),
      move('sconcept', 'sconcept__review', YOU),
      move('sconcept__review', 'sanimate', YOU),
      move('sanimate', 'sanimate__review', { actor: kiln }),
    ];

    expect(modelPerformance([trail('CRI-1', events)]).rows).toEqual([]);
  });

  it('never counts a move taken back', () => {
    const back = move('sconcept__review', 'sconcept', YOU, { reason: 'No' });
    const events = [
      created(),
      move('sconcept', 'sconcept__review', sonnet),
      back,
      move('sconcept', 'sconcept__review', YOU, { undoes: back.id }),
      move('sconcept__review', 'sanimate', YOU),
    ];

    const [row] = modelPerformance([trail('CRI-1', events)]).rows;
    expect(row).toMatchObject({ handoffs: 1, sentBack: 0, finishedSteps: 1, rounds: 1 });
  });

  it('counts an item finished for every profile that handed off part of it, and a discard for the last', () => {
    const done = [
      created(),
      move('sconcept', 'sconcept__review', sonnet),
      move('sconcept__review', 'sanimate', YOU),
      move('sanimate', 'sanimate__review', opus),
      move('sanimate__review', 'spolish', YOU),
      move('spolish', 'done', YOU),
    ];
    const dropped = [
      created(),
      move('sconcept', 'sconcept__review', sonnet),
      move('sconcept__review', 'dropped', YOU),
    ];

    const { rows, total } = modelPerformance([trail('CRI-1', done), trail('CRI-2', dropped)]);

    const by = (family: string) => rows.find((row) => row.family === family);
    expect(by('sonnet')).toMatchObject({ itemsFinished: 1, discards: 1, finishedSteps: 1 });
    expect(by('opus')).toMatchObject({ itemsFinished: 1, discards: 0, finishedSteps: 1 });
    expect(total).toMatchObject({ handoffs: 3, itemsFinished: 1, discards: 1 });
  });

  it('keeps only what happened in the period', () => {
    minute = 0;
    const events = [
      created(),
      move('sconcept', 'sconcept__review', sonnet),
      move('sconcept__review', 'sanimate', YOU),
      move('sanimate', 'sanimate__review', opus, {}, 60 * 24 * 10),
    ];

    const since = new Date(Date.UTC(2026, 0, 5)).toISOString();
    const { rows } = modelPerformance([trail('CRI-1', events)], { since });

    expect(rows.map(({ family }) => family)).toEqual(['opus']);
  });

  it('reads a board through its own step names, and keeps a step the board no longer has by id', () => {
    const events = [created(), move('sgone', 'sgone__review', sonnet)];

    const [row] = modelPerformance([trail('CRI-1', events)]).rows;

    expect(row?.steps).toEqual([expect.objectContaining({ step: 'sgone', stepName: 'sgone' })]);
  });

  it('leaves the median out when no handoff followed a claim', () => {
    const events = [created(), move('sconcept', 'sconcept__review', sonnet)];

    expect(modelPerformance([trail('CRI-1', events)]).rows[0]?.medianClaimToHandoffMs).toBeNull();
  });

  it('starts at a preset reading: the moves before it belong to the preset', () => {
    const events: HistoryEvent[] = [
      created('open'),
      move('open', 'working', sonnet),
      move('working', 'sconcept', YOU, { reason: 'migrate' }),
      move('sconcept', 'sconcept__review', opus),
    ];

    const { rows } = modelPerformance([trail('CRI-1', events)]);

    expect(rows.map(({ family, handoffs }) => [family, handoffs])).toEqual([['opus', 1]]);
  });

  it('orders the rows by handoffs, most first', () => {
    const events = [
      created(),
      move('sconcept', 'sconcept__review', sonnet),
      move('sconcept__review', 'sconcept', YOU, { reason: 'No' }),
      move('sconcept', 'sconcept__review', sonnet),
      move('sconcept__review', 'sanimate', YOU),
      move('sanimate', 'sanimate__review', opus),
    ];

    const { rows } = modelPerformance([trail('CRI-1', events)]);

    expect(rows.map(({ family }) => family)).toEqual(['sonnet', 'opus']);
  });
});

describe('parsePeriod', () => {
  const now = '2026-02-01T00:00:00.000Z';

  it('reads days and hours back from now', () => {
    expect(parsePeriod('30d', now)).toEqual({ since: '2026-01-02T00:00:00.000Z' });
    expect(parsePeriod('12h', now)).toEqual({ since: '2026-01-31T12:00:00.000Z' });
  });

  it('reads all as no limit', () => {
    expect(parsePeriod('all', now)).toEqual({});
  });

  it('refuses anything else', () => {
    expect(parsePeriod('soon', now)).toBeNull();
    expect(parsePeriod('0d', now)).toBeNull();
  });
});
