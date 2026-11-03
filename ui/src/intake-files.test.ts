import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  rolesFor,
  sizeLabel,
  tooLarge,
  withFiles,
} from './intake-files.ts';
import type { Layout, LayoutEntry, TypeView } from './types.ts';

const EMPTY: Layout = {
  header: [],
  evidence: [],
  body: [],
  side: [],
  row: [],
  phone: [],
  intake: [],
};

const typeWith = (evidence: LayoutEntry[]): TypeView => ({
  name: 'bug',
  label: 'Bug',
  initial: 'open',
  states: [],
  fields: [],
  layout: { ...EMPTY, evidence },
});

const file = (name: string, size = 10) => ({ name, size }) as File;

describe('intake files', () => {
  it('offers every role to a type without evidence modules', () => {
    expect(rolesFor(typeWith([]))).toEqual(['single', 'before', 'after']);
  });

  it('offers a before and an after to a compare, and single to every other module', () => {
    const compare: LayoutEntry = { module: 'images', id: 'pair', variant: 'compare' };
    const log: LayoutEntry = { module: 'log', id: 'log' };

    expect(rolesFor(typeWith([compare]))).toEqual(['before', 'after']);
    expect(rolesFor(typeWith([log]))).toEqual(['single']);
    expect(rolesFor(typeWith([compare, log]))).toEqual(['single', 'before', 'after']);
  });

  it('adds files up to the limit, each with its own key', () => {
    let next = 0;
    const key = () => `k${++next}`;
    const many = Array.from({ length: MAX_FILES + 2 }, (_, at) => file(`${at}.log`));

    const drafts = withFiles([], many, 'single', key);

    expect(drafts).toHaveLength(MAX_FILES);
    expect(new Set(drafts.map((draft) => draft.key)).size).toBe(MAX_FILES);
    expect(withFiles(drafts, [file('more.log')], 'single', key)).toHaveLength(MAX_FILES);
  });

  it('tells a file over the evidence limit and words sizes', () => {
    expect(tooLarge(file('big.mp4', MAX_FILE_BYTES + 1))).toBe(true);
    expect(tooLarge(file('ok.mp4', MAX_FILE_BYTES))).toBe(false);
    expect(sizeLabel(300)).toBe('1 KB');
    expect(sizeLabel(1.8 * 1024 * 1024)).toBe('1.8 MB');
  });
});
