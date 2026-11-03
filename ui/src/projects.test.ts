import { describe, expect, it } from 'vitest';
import {
  inboxOf,
  itemHref,
  projectHref,
  sizeLabel,
  waitingElsewhere,
  whereOf,
} from './projects.ts';
import type { ProjectOverview, WaitingItem } from './types.ts';

const item = (id: string): WaitingItem => ({
  id,
  collection: 'tasks',
  type: 'task',
  title: id,
  fields: {},
  presetVersion: 1,
  state: 'review',
  turn: 'human',
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  createdBy: { kind: 'agent', name: 'claude' },
  lease: null,
});

const project = (name: string, over: Partial<ProjectOverview> = {}): ProjectOverview => ({
  id: `${name}-aaaaaa`,
  name,
  storage: 'common',
  current: false,
  paths: [{ path: `/work/${name}`, kind: 'repo', missing: false }],
  waiting: [],
  withAgents: 0,
  open: 0,
  ...over,
});

describe('the projects inbox', () => {
  const projects = [
    project('api', {
      current: true,
      waiting: [item('TASKS-1'), item('TASKS-2')],
      open: 3,
      withAgents: 1,
    }),
    project('web', {
      waiting: [item('BUGS-7')],
      open: 4,
      withAgents: 3,
      served: 'http://127.0.0.1:4482',
    }),
    project('dotfiles'),
    project('gone', { unavailable: 'The data is missing' }),
  ];

  it('groups what waits for you by project and says what stays out', () => {
    const inbox = inboxOf(projects);
    expect(inbox.waiting).toBe(3);
    expect(inbox.groups.map((group) => group.name)).toEqual(['api', 'web']);
    expect(inbox.withAgents).toBe(4);
    expect(inbox.agentProjects).toEqual(['api', 'web']);
    expect(inbox.idle).toEqual(['dotfiles']);
    expect(inbox.unavailable.map((group) => group.name)).toEqual(['gone']);
  });

  it('counts what waits outside the project served here', () => {
    expect(waitingElsewhere(projects)).toEqual({ count: 1, projects: 1 });
  });

  it('leads a row here, to the server that shows it, or nowhere', () => {
    const [api, web, dotfiles] = projects;
    expect(api && itemHref(api, item('TASKS-1'))).toBe('#TASKS-1');
    expect(web && itemHref(web, item('BUGS-7'))).toBe('http://127.0.0.1:4482/#BUGS-7');
    expect(dotfiles && itemHref(dotfiles, item('X-1'))).toBeUndefined();
    expect(web && projectHref(web)).toBe('http://127.0.0.1:4482/');
  });

  it('names where a project lives by its first path still there', () => {
    expect(
      whereOf({
        paths: [
          { path: '/old', kind: 'repo', missing: true },
          { path: '/new', kind: 'repo', missing: false },
        ],
      }),
    ).toBe('/new');
  });

  it.each([
    [512, '512 B'],
    [4_404_019, '4.2 MB'],
    [134_217_728, '128 MB'],
  ])('writes %d bytes as %s', (bytes, label) => {
    expect(sizeLabel(bytes)).toBe(label);
  });
});
