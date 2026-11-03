import { describe, expect, it } from 'vitest';
import {
  briefHash,
  hashFor,
  ITEMS_HASH,
  idFromHash,
  modulesHash,
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
    ['', { view: 'items' }],
    ['#', { view: 'items' }],
    ['#TASKS-2', { view: 'items', id: 'TASKS-2' }],
    ['#/modules', { view: 'modules' }],
    ['#/modules/', { view: 'modules' }],
    ['#/modules/enum', { view: 'modules', name: 'enum' }],
    ['#/modules/my%20rating', { view: 'modules', name: 'my rating' }],
    ['#/modulesx', { view: 'items' }],
    ['#/elsewhere', { view: 'items' }],
    ['#/modules/%E0%A4%A', { view: 'modules' }],
    ['#/triage', { view: 'triage' }],
    ['#/triagex', { view: 'items' }],
    ['#/lan', { view: 'lan' }],
  ])('routes %j to %j', (hash, route) => {
    expect(routeFromHash(hash)).toEqual(route);
  });

  it('writes the item list with nothing selected as a hash', () => {
    expect(routeFromHash(ITEMS_HASH)).toEqual({ view: 'items' });
  });

  it('writes swipe triage as a hash', () => {
    expect(routeFromHash(TRIAGE_HASH)).toEqual({ view: 'triage' });
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
