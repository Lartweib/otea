import { describe, expect, it } from 'vitest';
import { viewKeyOf } from '../App.tsx';
import { hashOf, routeFromHash } from '../selection.ts';
import { routeToOpen } from './context.tsx';

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
  });

  // Opened from Triage it opened on its board, and closing it left the person there, the pass lost
  // (P7-R3-2): it opens over Triage, which stays as it was under it, and closing it goes back there.
  it('opens it over Triage, which keeps its pass, and closing it goes back to Triage', () => {
    const open = routeToOpen({ view: 'triage' }, item, false);
    expect(open).toEqual({ view: 'triage', item: 'ERR-214' });
    expect(routeToOpen({ view: 'triage', item: 'ERR-1' }, item, true)).toEqual(open);
    expect(routeFromHash(hashOf(open))).toEqual(open);
    expect(viewKeyOf(open)).toBe(viewKeyOf({ view: 'triage' }));
    const { item: _closed, ...back } = open;
    expect(hashOf(back)).toBe('#/triage');
  });
});
