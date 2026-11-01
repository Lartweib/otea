import { describe, expect, it } from 'vitest';
import type { CollectionView } from './types.ts';
import { readViewPrefs, writeViewPrefs } from './view-prefs.ts';

const bugs: CollectionView = {
  name: 'bugs',
  prefix: 'BUGS',
  preset: 'bug-triage',
  types: [
    {
      name: 'item',
      label: 'Item',
      initial: 'reported',
      states: [
        { name: 'reported', turn: 'human' },
        { name: 'fixed', turn: 'none', closes: 'done' },
      ],
      fields: [
        { name: 'title', module: 'text' },
        { name: 'severity', module: 'severity', values: ['low', 'medium', 'high', 'critical'] },
        { name: 'category', module: 'enum', values: ['crash', 'visual'] },
      ],
      layout: { header: [], evidence: [], body: [], side: [], row: [], phone: [], intake: [] },
    },
  ],
  view: {
    kind: 'grid',
    groupBy: 'severity',
    columns: ['id', 'title', 'category', 'severity', 'state', 'who', 'age'],
  },
};

const memory = (entries: Record<string, string> = {}) => {
  const data = new Map(Object.entries(entries));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

describe('readViewPrefs', () => {
  it('starts from the preset: its view kind and grouping, no sort and no filters', () => {
    expect(readViewPrefs(memory(), bugs)).toEqual({
      mode: 'grid',
      group: 'severity',
      sort: null,
      filters: {},
    });
    const list = { ...bugs, view: { ...bugs.view, kind: 'board' as const, groupBy: 'area' } };
    expect(readViewPrefs(undefined, list)).toMatchObject({ mode: 'list', group: 'turn' });
  });

  it('reads what this browser chose for the collection', () => {
    const storage = memory({
      'otea.view.bugs': 'list',
      'otea.group.bugs': 'category',
      'otea.sort.bugs': '{"key":"severity","dir":"desc"}',
      'otea.filters.bugs': '{"category":["crash"],"state":["reported"]}',
    });

    expect(readViewPrefs(storage, bugs)).toEqual({
      mode: 'list',
      group: 'category',
      sort: { key: 'severity', dir: 'desc' },
      filters: { category: ['crash'], state: ['reported'] },
    });
  });

  it('ignores what no longer fits the preset, and what is not well formed', () => {
    const storage = memory({
      'otea.view.bugs': 'board',
      'otea.group.bugs': 'area',
      'otea.sort.bugs': '{"key":"area","dir":"asc"}',
      'otea.filters.bugs': '{"area":["den"],"category":[3,"visual"],"title":["x"]}',
    });

    expect(readViewPrefs(storage, bugs)).toEqual({
      mode: 'grid',
      group: 'severity',
      sort: null,
      filters: { category: ['visual'] },
    });
    expect(readViewPrefs(memory({ 'otea.sort.bugs': '{' }), bugs).sort).toBeNull();
  });

  it('falls back to the preset when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    expect(readViewPrefs(broken, bugs)).toMatchObject({ mode: 'grid', group: 'severity' });
    expect(() => writeViewPrefs(broken, 'bugs', { mode: 'list' })).not.toThrow();
  });
});

describe('writeViewPrefs', () => {
  it('keeps each choice under the collection, only those given', () => {
    const storage = memory();
    writeViewPrefs(storage, 'bugs', {
      mode: 'list',
      sort: { key: 'age', dir: 'asc' },
      filters: { category: ['crash'] },
    });
    writeViewPrefs(storage, 'bugs', { group: 'turn', sort: null });

    expect(Object.fromEntries(storage.data)).toEqual({
      'otea.view.bugs': 'list',
      'otea.group.bugs': 'turn',
      'otea.sort.bugs': 'null',
      'otea.filters.bugs': '{"category":["crash"]}',
    });
  });
});
