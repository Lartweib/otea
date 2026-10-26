import { describe, expect, it } from 'vitest';
import { OteaError } from './errors.ts';
import { tasks } from './testing.ts';
import { assertTransition, transitionsBetween, transitionsFrom, turnOf } from './workflow.ts';

describe('the official tasks workflow', () => {
  it('starts in todo and enriches in incomplete', () => {
    expect(tasks.initial).toBe('todo');
    expect(tasks.incomplete).toBe('incomplete');
  });

  it.each([
    ['incomplete', 'agent'],
    ['todo', 'agent'],
    ['in_progress', 'agent'],
    ['review', 'human'],
    ['done', 'none'],
    ['discarded', 'none'],
  ])('gives %s the %s turn', (state, turn) => {
    expect(turnOf(tasks, state)).toBe(turn);
  });

  it.each([
    ['incomplete', 'todo', 'agent', false],
    ['todo', 'in_progress', 'agent', false],
    ['in_progress', 'review', 'agent', false],
    ['review', 'done', 'human-ui', false],
    ['review', 'todo', 'human-ui', true],
    ['todo', 'discarded', 'human', true],
    ['review', 'discarded', 'human', true],
  ])('allows %s -> %s by %s', (from, to, by, reasonRequired) => {
    expect(transitionsBetween(tasks, from, to)).toEqual([{ from, to, by, reasonRequired }]);
  });

  it.each([
    ['todo', 'done'],
    ['todo', 'review'],
    ['in_progress', 'done'],
    ['done', 'todo'],
    ['done', 'discarded'],
    ['discarded', 'todo'],
    ['todo', 'todo'],
  ])('has no %s -> %s transition', (from, to) => {
    expect(transitionsBetween(tasks, from, to)).toEqual([]);
  });

  it('lets humans and agents discard an incomplete item through separate transitions', () => {
    expect(transitionsBetween(tasks, 'incomplete', 'discarded').map(({ by }) => by)).toEqual([
      'human',
      'agent',
    ]);
  });

  it('gives terminal states no outgoing transitions', () => {
    const terminal = tasks.states.filter((state) => state.turn === 'none');
    for (const state of terminal) expect(transitionsFrom(tasks, state.name)).toEqual([]);
  });

  it('lists the transitions leaving a state in declaration order', () => {
    expect(transitionsFrom(tasks, 'incomplete').map(({ to, by }) => [to, by])).toEqual([
      ['todo', 'agent'],
      ['discarded', 'human'],
      ['discarded', 'agent'],
    ]);
  });
});

describe('turnOf', () => {
  it('fails with not_found for an unknown state', () => {
    expect(() => turnOf(tasks, 'missing')).toThrow(expect.objectContaining({ code: 'not_found' }));
  });
});

describe('assertTransition', () => {
  it('returns the matching transitions', () => {
    expect(assertTransition(tasks, 'todo', 'in_progress')).toMatchObject([{ by: 'agent' }]);
  });

  it('throws an invalid_transition domain error otherwise', () => {
    const attempt = () => assertTransition(tasks, 'todo', 'done');

    expect(attempt).toThrow(OteaError);
    expect(attempt).toThrow(expect.objectContaining({ code: 'invalid_transition' }));
  });
});
