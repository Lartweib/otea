import { describe, expect, it } from 'vitest';
import { firstProject, forget, parseRecents, type Recent, remember } from './recent.ts';

const a: Recent = { root: '/work/a', name: 'A', openedAt: 1 };
const b: Recent = { root: '/work/b', name: 'B', openedAt: 2 };

describe('recent projects', () => {
  it('keeps the last opened first, once, and at most eight', () => {
    expect(remember([a, b], { ...b, openedAt: 3 })).toEqual([{ ...b, openedAt: 3 }, a]);
    const many = Array.from({ length: 10 }, (_, n) => ({
      root: `/p${n}`,
      name: `P${n}`,
      openedAt: n,
    }));
    const kept = many.reduce<Recent[]>((list, each) => remember(list, each), []);
    expect(kept.map(({ root }) => root)).toEqual([
      '/p9',
      '/p8',
      '/p7',
      '/p6',
      '/p5',
      '/p4',
      '/p3',
      '/p2',
    ]);
  });

  it('forgets one', () => {
    expect(forget([a, b], '/work/a')).toEqual([b]);
  });

  it('reads only well-formed entries from the file', () => {
    expect(parseRecents([a, { root: 3 }, null, { root: '/x', name: 'X' }, b])).toEqual([a, b]);
    expect(parseRecents('nope')).toEqual([]);
  });
});

describe('firstProject', () => {
  const exists = (root: string) => root !== '/gone';

  it('opens the folder given with --project', () => {
    expect(firstProject({ asked: '/given', recents: [a], exists })).toEqual({
      kind: 'open',
      dir: '/given',
    });
  });

  it('reopens the last project that still exists', () => {
    const gone = { ...a, root: '/gone' };
    expect(firstProject({ recents: [gone, b], exists })).toEqual({ kind: 'open', dir: '/work/b' });
  });

  // First run: nothing to reopen, so the picker asks (Abrir carpeta, Crear proyecto).
  it('asks on a first run', () => {
    expect(firstProject({ recents: [], exists })).toEqual({ kind: 'pick' });
  });
});
