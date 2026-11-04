import { describe, expect, it } from 'vitest';
import { rawOf, readDraft } from './draft.ts';
import {
  addMove,
  addState,
  byChoices,
  laneLayout,
  removeMove,
  setCloses,
  setMove,
  setRequires,
  setTurn,
  waysOut,
} from './lanes-edit.ts';

const PRESET = `preset: game-bugs
preset_version: 3
fields:
  title: { module: text, required: create }
workflow:
  initial: reported
  states:
    reported: { turn: human }
    fixing: { turn: agent }
    verify: { turn: human }
    fixed: { turn: none, closes: done }
    rejected: { turn: none, closes: discarded }
  transitions:
    - { from: reported, to: fixing, by: human }
    - { from: fixing, to: verify, by: agent, reason: required }
    - { from: verify, to: fixed, by: human-ui }
    - { from: verify, to: fixing, by: human, reason: required }
    - { from: [reported, fixing], to: rejected, by: human-ui, reason: required }
types:
  bug:
    label: Bug
labels:
  es:
    types: { bug: Error }
    states: { reported: reportado, fixing: en arreglo, verify: a verificar, fixed: arreglado, rejected: rechazado }
    fields: { title: título }
`;

const raw = () => rawOf(PRESET);
const states = (yaml: string) => rawOf(yaml).workflow?.states ?? {};
const moves = (yaml: string) => rawOf(yaml).workflow?.transitions ?? [];

describe('editing a state on the lanes', () => {
  it('moves a state to the other lane, keeping what it waits for', () => {
    const next = setTurn(PRESET, raw(), 'bug', 'verify', 'agent');
    expect(states(next).verify).toEqual({ turn: 'agent' });
  });

  it('closes a state as done or discarded, which takes it off both lanes', () => {
    const next = setCloses(PRESET, raw(), 'bug', 'verify', 'discarded');
    expect(states(next).verify).toEqual({ turn: 'none', closes: 'discarded' });
    expect(states(setCloses(PRESET, raw(), 'bug', 'fixed', undefined)).fixed).toEqual({
      turn: 'agent',
    });
  });

  it('sets what entering a state waits for', () => {
    const next = setRequires(PRESET, raw(), 'bug', 'fixed', 'blockers_closed', true);
    expect(states(next).fixed).toEqual({
      turn: 'none',
      closes: 'done',
      requires: ['blockers_closed'],
    });
    expect(
      states(setRequires(next, rawOf(next), 'bug', 'fixed', 'blockers_closed', false)).fixed,
    ).toEqual({ turn: 'none', closes: 'done' });
  });

  it('adds a state on a lane, with its words', () => {
    const next = addState(PRESET, raw(), 'bug', 'triage', 'human');
    expect(states(next).triage).toEqual({ turn: 'human' });
    expect(next).toContain('triage: triage');
  });

  it('lists the ways out of a state, one per move that leaves it', () => {
    expect(waysOut(raw(), 'bug', 'verify')).toEqual([
      { index: 2, to: 'fixed', by: 'human-ui', reason: undefined },
      { index: 3, to: 'fixing', by: 'human', reason: 'required' },
    ]);
  });
});

describe('editing a move on the lanes', () => {
  it('adds a move from one state to another', () => {
    const next = addMove(PRESET, raw(), 'bug', 'reported', 'verify', 'human');
    expect(moves(next).at(-1)).toEqual({ from: 'reported', to: 'verify', by: 'human' });
  });

  it('changes who makes a move and whether it asks for a reason', () => {
    let next = setMove(PRESET, raw(), 'bug', 0, { by: 'human-ui' });
    next = setMove(next, rawOf(next), 'bug', 0, { reason: 'required' });
    expect(moves(next)[0]).toEqual({
      from: 'reported',
      to: 'fixing',
      by: 'human-ui',
      reason: 'required',
    });
    next = setMove(next, rawOf(next), 'bug', 0, { reason: undefined });
    expect(moves(next)[0]).toEqual({ from: 'reported', to: 'fixing', by: 'human-ui' });
    expect(readDraft(next).ok).toBe(true);
  });

  it('removes a move', () => {
    expect(moves(removeMove(PRESET, raw(), 'bug', 1))).toHaveLength(4);
  });

  it('strikes the agent on a move that closes as done', () => {
    expect(byChoices(raw(), 'bug', 'fixed')).toEqual([
      { value: 'agent', struck: expect.any(String) },
      { value: 'human' },
      { value: 'human-ui' },
    ]);
    expect(byChoices(raw(), 'bug', 'verify')[0]).toEqual({ value: 'agent' });
  });
});

describe('where the lanes place each state', () => {
  it('puts agent states on the left lane, yours on the right, and closed ones below', () => {
    const at = laneLayout(raw(), 'bug', 600);
    const of = (name: string) => at.states.find((state) => state.name === name);
    expect(of('fixing')?.x).toBeLessThan(of('reported')?.x ?? 0);
    expect(of('verify')?.x).toBe(of('reported')?.x);
    expect(of('fixed')?.y).toBeGreaterThan(of('verify')?.y ?? 0);
    expect(of('rejected')?.y).toBeGreaterThan(of('fixed')?.y ?? 0);
    expect(of('reported')?.y).toBeLessThan(of('fixing')?.y ?? 0);
  });
});
