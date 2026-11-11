import { describe, expect, it } from 'vitest';
import type { CollectionView } from './types.ts';
import { readViewPrefs, writeViewPrefs } from './view-prefs.ts';

const bugs: CollectionView = {
  name: 'bugs',
  prefix: 'BUGS',
  preset: 'bug-triage',
  icon: null,
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
        { name: 'area', module: 'text' },
        { name: 'steps', module: 'markdown' },
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
      mode: 'tabla',
      group: 'severity',
      sort: null,
      filters: {},
      columns: ['id', 'title', 'category', 'severity', 'state', 'who', 'age'],
      widths: {},
    });
    const list = { ...bugs, view: { ...bugs.view, kind: 'board' as const, groupBy: 'steps' } };
    expect(readViewPrefs(undefined, list)).toMatchObject({ mode: 'pasos', group: 'state' });
    const plain = { ...bugs, view: { ...bugs.view, kind: 'list' as const, groupBy: 'turn' } };
    expect(readViewPrefs(undefined, plain)).toMatchObject({ mode: 'lista', group: 'state' });
  });

  it('reads what this browser chose for the collection', () => {
    const storage = memory({
      'otea.view.bugs': 'lista',
      'otea.group.bugs': 'category',
      'otea.sort.bugs': '{"key":"severity","dir":"desc"}',
      'otea.filters.bugs': '{"category":["crash"],"state":["reported"]}',
    });

    expect(readViewPrefs(storage, bugs)).toMatchObject({
      mode: 'lista',
      group: 'category',
      sort: { key: 'severity', dir: 'desc' },
      filters: { category: ['crash'], state: ['reported'] },
    });
  });

  it('keeps the board groupings and filters: step, turn, who, no grouping', () => {
    const storage = memory({
      'otea.view.bugs': 'pasos',
      'otea.group.bugs': 'who',
      'otea.filters.bugs': '{"state":["__closed"],"turn":["human"],"who":["kiln"]}',
      'otea.sort.bugs': '{"key":"who","dir":"asc"}',
    });
    expect(readViewPrefs(storage, bugs)).toMatchObject({
      mode: 'pasos',
      group: 'who',
      filters: { state: ['__closed'], turn: ['human'], who: ['kiln'] },
      sort: { key: 'who', dir: 'asc' },
    });
    expect(readViewPrefs(memory({ 'otea.group.bugs': 'none' }), bugs).group).toBe('none');
  });

  it('reads free text filters and groups, as their normalized values', () => {
    const storage = memory({
      'otea.group.bugs': 'area',
      'otea.filters.bugs': '{"area":["farm",""],"steps":["x"]}',
    });

    expect(readViewPrefs(storage, bugs)).toMatchObject({
      group: 'area',
      filters: { area: ['farm', ''] },
    });
  });

  it('reads the columns shown, id and title always, in their place; the widths of resizable ones', () => {
    const storage = memory({
      'otea.columns.bugs': '["state","area","gone",3,"who"]',
      'otea.widths.bugs': '{"state":150.4,"area":2000,"id":300,"who":90,"category":"wide"}',
    });

    expect(readViewPrefs(storage, bugs)).toMatchObject({
      columns: ['id', 'title', 'area', 'state', 'who'],
      widths: { state: 150, area: 480 },
    });
    expect(readViewPrefs(memory({ 'otea.columns.bugs': '{}' }), bugs).columns).toEqual(
      readViewPrefs(memory(), bugs).columns,
    );
  });

  it('keeps a sort only on a column shown', () => {
    const storage = memory({
      'otea.columns.bugs': '["state"]',
      'otea.sort.bugs': '{"key":"severity","dir":"desc"}',
    });

    expect(readViewPrefs(storage, bugs).sort).toBeNull();
  });

  it('ignores what no longer fits the preset, and what is not well formed', () => {
    const storage = memory({
      'otea.view.bugs': 'board',
      'otea.group.bugs': 'steps',
      'otea.sort.bugs': '{"key":"steps","dir":"asc"}',
      'otea.filters.bugs': '{"steps":["den"],"category":[3,"visual"],"title":["x"]}',
      'otea.widths.bugs': '[150]',
    });

    expect(readViewPrefs(storage, bugs)).toMatchObject({
      mode: 'tabla',
      group: 'severity',
      sort: null,
      filters: { category: ['visual'] },
      widths: {},
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

    expect(readViewPrefs(broken, bugs)).toMatchObject({ mode: 'tabla', group: 'severity' });
    expect(() => writeViewPrefs(broken, 'bugs', { mode: 'lista' })).not.toThrow();
  });
});

describe('writeViewPrefs', () => {
  it('keeps each choice under the collection, only those given', () => {
    const storage = memory();
    writeViewPrefs(storage, 'bugs', {
      mode: 'lista',
      sort: { key: 'age', dir: 'asc' },
      filters: { category: ['crash'] },
    });
    writeViewPrefs(storage, 'bugs', { group: 'turn', sort: null });
    writeViewPrefs(storage, 'bugs', { columns: ['id', 'title', 'state'], widths: { state: 150 } });

    expect(Object.fromEntries(storage.data)).toEqual({
      'otea.view.bugs': 'lista',
      'otea.group.bugs': 'turn',
      'otea.sort.bugs': 'null',
      'otea.filters.bugs': '{"category":["crash"]}',
      'otea.columns.bugs': '["id","title","state"]',
      'otea.widths.bugs': '{"state":150}',
    });
  });
});
