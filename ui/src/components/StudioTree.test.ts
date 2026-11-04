import { describe, expect, it } from 'vitest';
import type { PresetSummary, ProjectBlueprint } from '../studio/api.ts';
import { studioTreeOf } from './StudioTree.tsx';

const preset = (name: string, origin: 'official' | 'project', collections: string[] = []) =>
  ({ name, origin, version: 2, collections, problems: [] }) satisfies PresetSummary;

const blueprint = {
  name: 'game-studio',
  version: 1,
  boards: [
    { name: 'work', items: 4 },
    { name: 'bugs', items: 2 },
  ],
} as unknown as ProjectBlueprint;

describe('studioTreeOf', () => {
  it('reads the blueprint, the presets and the modules from what Studio loads', () => {
    const tree = studioTreeOf({
      presets: [preset('tasks', 'official', ['work']), preset('game-bugs', 'project')],
      blueprint,
      modules: 15,
      route: { view: 'studio', page: { kind: 'start' } },
    });

    expect(tree.blueprint).toEqual({ name: 'game-studio', version: 1, boards: 2 });
    expect(tree.presets).toEqual([
      { name: 'tasks', version: 2, collections: ['work'], official: true },
      { name: 'game-bugs', version: 2, collections: [], official: false },
    ]);
    expect(tree.modules).toBe(15);
    expect(tree.current).toBeUndefined();
  });

  it('marks the page in view', () => {
    const at = (route: Parameters<typeof studioTreeOf>[0]['route']) =>
      studioTreeOf({ presets: [], blueprint: null, modules: 0, route }).current;

    expect(at({ view: 'studio', page: { kind: 'preset', name: 'tasks' } })).toEqual({
      kind: 'preset',
      name: 'tasks',
    });
    expect(at({ view: 'studio', page: { kind: 'blueprint', diagram: true } })).toEqual({
      kind: 'blueprint',
    });
    expect(at({ view: 'studio', page: { kind: 'blueprints' } })).toEqual({ kind: 'blueprint' });
    expect(at({ view: 'modules', name: 'severity' })).toEqual({ kind: 'modules' });
  });

  it('has no blueprint while the project has none', () => {
    expect(
      studioTreeOf({
        presets: [],
        blueprint: null,
        modules: 0,
        route: { view: 'studio', page: { kind: 'start' } },
      }).blueprint,
    ).toBeNull();
  });
});
