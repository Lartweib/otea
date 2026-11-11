import { describe, expect, it } from 'vitest';
import { officialType } from '../derive/fixtures.ts';
import { inverseMove, routeToOpen } from './context.tsx';

describe('opening an item', () => {
  const item = { id: 'ERR-214', collection: 'Errores' };

  it('opens it in the list on screen when its row is there', () => {
    expect(routeToOpen({ view: 'toca' }, item, true)).toEqual({ view: 'toca', item: 'ERR-214' });
    expect(routeToOpen({ view: 'board', board: 'Errores', item: 'ERR-1' }, item, true)).toEqual({
      view: 'board',
      board: 'Errores',
      item: 'ERR-214',
    });
  });

  it('else opens it on its board', () => {
    expect(routeToOpen({ view: 'atasco' }, item, false)).toEqual({
      view: 'board',
      board: 'Errores',
      item: 'ERR-214',
    });
    expect(routeToOpen({ view: 'triage' }, item, true)).toEqual({
      view: 'board',
      board: 'Errores',
      item: 'ERR-214',
    });
  });
});

describe('undoing a move', () => {
  const bug = officialType('bug-triage');

  it('offers Deshacer when you can move it straight back, without a reason', () => {
    // verify → fixing asks a reason; reported → accepted has no way back of yours
    expect(inverseMove(bug, 'verify', 'fixing')).toBe(false);
    expect(inverseMove(bug, 'reported', 'accepted')).toBe(false);
    expect(inverseMove(bug, 'needs_info', 'reported')).toBe(false);
  });

  it('knows a move back that is yours and free', () => {
    const type = {
      ...bug,
      transitions: [
        { from: 'review', to: 'done', by: 'human-ui' as const, reasonRequired: false },
        { from: 'done', to: 'review', by: 'human' as const, reasonRequired: false },
      ],
    };
    expect(inverseMove(type, 'review', 'done')).toBe(true);
    expect(inverseMove(undefined, 'review', 'done')).toBe(false);
  });
});
