import { describe, expect, it } from 'vitest';
import { OteaError } from './errors.ts';
import { assertTransition, canTransition, tasks, turnOf } from './workflow.ts';

describe('tasks workflow', () => {
  it('starts in todo', () => {
    expect(tasks.initial).toBe('todo');
  });

  it.each([
    ['todo', 'agent'],
    ['in_progress', 'agent'],
    ['review', 'human'],
    ['done', 'none'],
    ['discarded', 'none'],
  ])('gives %s the %s turn', (state, turn) => {
    expect(turnOf(tasks, state)).toBe(turn);
  });

  it.each([
    ['todo', 'in_progress'],
    ['in_progress', 'review'],
    ['review', 'done'],
    ['review', 'todo'],
    ['todo', 'discarded'],
    ['in_progress', 'discarded'],
    ['review', 'discarded'],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(tasks, from, to)).toBe(true);
  });

  it.each([
    ['todo', 'done'],
    ['todo', 'review'],
    ['in_progress', 'done'],
    ['done', 'todo'],
    ['done', 'discarded'],
    ['discarded', 'todo'],
    ['todo', 'todo'],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransition(tasks, from, to)).toBe(false);
  });

  it('gives terminal states no outgoing transitions', () => {
    const terminal = tasks.states.filter((state) => state.turn === 'none');
    for (const state of terminal) expect(tasks.transitions[state.name] ?? []).toEqual([]);
  });
});

describe('turnOf', () => {
  it('fails with not_found for an unknown state', () => {
    expect(() => turnOf(tasks, 'missing')).toThrow(expect.objectContaining({ code: 'not_found' }));
  });
});

describe('assertTransition', () => {
  it('accepts an allowed transition', () => {
    expect(() => assertTransition(tasks, 'todo', 'in_progress')).not.toThrow();
  });

  it('throws an invalid_transition domain error otherwise', () => {
    const attempt = () => assertTransition(tasks, 'todo', 'done');

    expect(attempt).toThrow(OteaError);
    expect(attempt).toThrow(expect.objectContaining({ code: 'invalid_transition' }));
  });
});
