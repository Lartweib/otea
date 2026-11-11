import { describe, expect, it } from 'vitest';
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
    expect(routeToOpen({ view: 'triage' }, item, true)).toEqual({
      view: 'board',
      board: 'Errores',
      item: 'ERR-214',
    });
  });
});
