import { describe, expect, it } from 'vitest';
import {
  boardHash,
  briefHash,
  hashFor,
  hashOf,
  ITEMS_HASH,
  idFromHash,
  modulesHash,
  type Route,
  routeFromHash,
  studioHash,
  TRIAGE_HASH,
} from './selection.ts';

describe('selection', () => {
  it.each([
    ['#TASKS-2', 'TASKS-2'],
    ['#BUG%20REPORTS-1', 'BUG REPORTS-1'],
    ['#', undefined],
    ['', undefined],
  ])('reads %j as %j', (hash, id) => {
    expect(idFromHash(hash)).toBe(id);
  });

  it('ignores a malformed hash', () => {
    expect(idFromHash('#%E0%A4%A')).toBeUndefined();
  });

  it('writes an id as a hash', () => {
    expect(hashFor('TASKS-2')).toBe('#TASKS-2');
  });

  it.each([
    ['', { view: 'toca' }],
    ['#', { view: 'toca' }],
    ['#/', { view: 'toca' }],
    ['#TASKS-2', { view: 'toca', item: 'TASKS-2' }],
    ['#BUG%20REPORTS-1', { view: 'toca', item: 'BUG REPORTS-1' }],
    ['#/i/ERR-214', { view: 'toca', item: 'ERR-214' }],
    ['#/atasco', { view: 'atasco' }],
    ['#/atasco/i/ERR-9', { view: 'atasco', item: 'ERR-9' }],
    ['#/b/Errores', { view: 'board', board: 'Errores' }],
    ['#/b/Mis%20cosas', { view: 'board', board: 'Mis cosas' }],
    ['#/b/Errores/i/ERR-214', { view: 'board', board: 'Errores', item: 'ERR-214' }],
    ['#/b/', { view: 'toca' }],
    ['#/modules', { view: 'modules' }],
    ['#/modules/', { view: 'modules' }],
    ['#/modules/enum', { view: 'modules', name: 'enum' }],
    ['#/modules/my%20rating', { view: 'modules', name: 'my rating' }],
    ['#/modulesx', { view: 'toca' }],
    ['#/elsewhere', { view: 'toca' }],
    ['#/modules/%E0%A4%A', { view: 'modules' }],
    ['#/triage', { view: 'triage' }],
    ['#/projects', { view: 'projects' }],
    ['#/settings', { view: 'settings' }],
    ['#/projects/x', { view: 'toca' }],
    ['#/triagex', { view: 'toca' }],
    ['#/lan', { view: 'lan' }],
    ['#/i/%E0%A4%A', { view: 'toca' }],
  ])('routes %j to %j', (hash, route) => {
    expect(routeFromHash(hash)).toEqual(route);
  });

  it.each([
    [{ view: 'toca' }, '#/'],
    [{ view: 'toca', item: 'ERR-214' }, '#/i/ERR-214'],
    [{ view: 'atasco' }, '#/atasco'],
    [{ view: 'atasco', item: 'ERR 9' }, '#/atasco/i/ERR%209'],
    [{ view: 'board', board: 'Errores' }, '#/b/Errores'],
    [{ view: 'board', board: 'Mis cosas', item: 'MC-1' }, '#/b/Mis%20cosas/i/MC-1'],
    [{ view: 'triage' }, '#/triage'],
    [{ view: 'projects' }, '#/projects'],
    [{ view: 'settings' }, '#/settings'],
    [{ view: 'lan' }, '#/lan'],
    [{ view: 'modules', name: 'enum' }, '#/modules/enum'],
    [{ view: 'brief', ids: ['A', 'B'] }, '#/brief/A,B'],
    [{ view: 'studio', page: { kind: 'blueprint', diagram: false } }, '#/studio/blueprint'],
    [{ view: 'customize', target: { kind: 'item', id: 'A-1' } }, '#/customize/A-1'],
  ] as [Route, string][])('writes %j as %j, and reads it back', (route, hash) => {
    expect(hashOf(route)).toBe(hash);
    expect(routeFromHash(hash)).toEqual(route);
  });

  it('opens an item only on the views that list items', () => {
    expect(hashOf({ view: 'triage', item: 'A' })).toBe('#/triage');
  });

  it('writes Te toca with nothing open as a hash', () => {
    expect(routeFromHash(ITEMS_HASH)).toEqual({ view: 'toca' });
  });

  it('writes swipe triage as a hash', () => {
    expect(routeFromHash(TRIAGE_HASH)).toEqual({ view: 'triage' });
  });

  it('writes a board as a hash', () => {
    expect(boardHash('Mis cosas')).toBe('#/b/Mis%20cosas');
  });

  it('writes a brief for its items as a hash, in their order', () => {
    expect(briefHash(['WORK-2', 'BUGS-1'])).toBe('#/brief/WORK-2,BUGS-1');
    expect(routeFromHash(briefHash(['A,1', 'B']))).toEqual({ view: 'brief', ids: ['A,1', 'B'] });
    expect(routeFromHash('#/brief')).toEqual({ view: 'brief', ids: [] });
  });

  it('writes the catalog and one module as a hash', () => {
    expect(modulesHash()).toBe('#/modules');
    expect(modulesHash('my rating')).toBe('#/modules/my%20rating');
    expect(routeFromHash(modulesHash('a/b'))).toEqual({ view: 'modules', name: 'a/b' });
  });

  it.each([
    ['#/studio', { kind: 'start' }],
    ['#/studio/preset/my-tasks', { kind: 'preset', name: 'my-tasks' }],
    ['#/studio/preset/', { kind: 'start' }],
    ['#/studio/blueprint', { kind: 'blueprint', diagram: false }],
    ['#/studio/blueprint/diagram', { kind: 'blueprint', diagram: true }],
    ['#/studio/blueprints', { kind: 'blueprints' }],
    ['#/studio/elsewhere', { kind: 'start' }],
  ])('routes %j to the Studio page %j', (hash, page) => {
    expect(routeFromHash(hash)).toEqual({ view: 'studio', page });
  });

  it('writes each Studio page as a hash it reads back', () => {
    const pages = [
      { kind: 'start' },
      { kind: 'preset', name: 'bug-triage' },
      { kind: 'blueprint', diagram: true },
      { kind: 'blueprints' },
    ] as const;
    for (const page of pages)
      expect(routeFromHash(studioHash(page))).toEqual({ view: 'studio', page });
  });
});
