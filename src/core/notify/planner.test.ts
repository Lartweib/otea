import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  GATHER_MS,
  ITEM_COOLDOWN_MS,
  inQuietHours,
  type NotifyPrefs,
  Planner,
} from './planner.ts';
import type { Signal } from './signals.ts';

const T0 = Date.parse('2026-11-14T10:00:00.000Z');

const turn = (item: string, title = `Title ${item}`): Signal => ({
  key: `turn:${item}:review:`,
  kind: 'turn',
  item,
  title,
});
const stuck = (item: string): Signal => ({
  key: `stuck:${item}:codex:t`,
  kind: 'stuck',
  item,
  title: `Title ${item}`,
  by: 'codex',
});
const replied = (item: string): Signal => ({
  key: `replied:${item}:1:t`,
  kind: 'replied',
  item,
  title: `Title ${item}`,
  by: 'claude',
});

const keys = (signals: Signal[]) => new Set(signals.map(({ key }) => key));

describe('inQuietHours', () => {
  it('is never quiet without quiet hours', () => {
    expect(inQuietHours(null, 3 * 60)).toBe(false);
  });

  it('takes hours that cross midnight', () => {
    const night = { from: '22:00', to: '07:30' };
    expect(inQuietHours(night, 23 * 60)).toBe(true);
    expect(inQuietHours(night, 2 * 60)).toBe(true);
    expect(inQuietHours(night, 7 * 60 + 30)).toBe(false);
    expect(inQuietHours(night, 12 * 60)).toBe(false);
  });

  it('takes hours within a day', () => {
    const lunch = { from: '13:00', to: '14:00' };
    expect(inQuietHours(lunch, 13 * 60 + 15)).toBe(true);
    expect(inQuietHours(lunch, 14 * 60)).toBe(false);
  });
});

describe('Planner', () => {
  let planner: Planner;
  let prefs: NotifyPrefs;
  // Noon: never in the quiet hours the tests set unless they say so.
  const minuteOfDay = () => 12 * 60;

  beforeEach(() => {
    planner = new Planner(minuteOfDay);
    prefs = { ...DEFAULT_PREFS };
  });

  it('turns everything on by default, with no quiet hours', () => {
    expect(DEFAULT_PREFS).toEqual({ turn: true, replied: true, stuck: true, quiet: null });
  });

  it('waits a moment before telling, so a burst arrives as one', () => {
    const one = [turn('A')];
    planner.offer(one, prefs, T0);
    expect(planner.take(T0 + GATHER_MS - 1, keys(one), prefs)).toEqual([]);
    expect(planner.take(T0 + GATHER_MS, keys(one), prefs)).toEqual([
      { kind: 'turn', item: 'A', title: 'Title A' },
    ]);
    expect(planner.take(T0 + GATHER_MS + 1, keys(one), prefs)).toEqual([]);
  });

  it('groups a burst on several items into one notice', () => {
    const burst = [turn('A'), turn('B')];
    planner.offer(burst, prefs, T0);
    planner.offer([turn('C')], prefs, T0 + 2000);
    const all = keys([...burst, turn('C')]);
    expect(planner.take(T0 + GATHER_MS, all, prefs)).toEqual([
      {
        kind: 'group',
        count: 3,
        of: 'turn',
        items: [
          { item: 'A', title: 'Title A', kind: 'turn' },
          { item: 'B', title: 'Title B', kind: 'turn' },
          { item: 'C', title: 'Title C', kind: 'turn' },
        ],
      },
    ]);
  });

  it('says a mixed group is mixed', () => {
    const burst = [turn('A'), stuck('B')];
    planner.offer(burst, prefs, T0);
    const [notice] = planner.take(T0 + GATHER_MS, keys(burst), prefs);
    expect(notice).toMatchObject({ kind: 'group', count: 2, of: 'mixed' });
  });

  it('tells one thing per item: its turn before its other news', () => {
    const both = [replied('A'), turn('A')];
    planner.offer(both, prefs, T0);
    expect(planner.take(T0 + GATHER_MS, keys(both), prefs)).toEqual([
      { kind: 'turn', item: 'A', title: 'Title A' },
    ]);
  });

  it('drops what stopped being true before it went out', () => {
    planner.offer([turn('A')], prefs, T0);
    expect(planner.take(T0 + GATHER_MS, new Set(), prefs)).toEqual([]);
    expect(planner.hasPending()).toBe(false);
  });

  it('tells about an item at most once every few minutes, then what still holds', () => {
    const first = [turn('A')];
    planner.offer(first, prefs, T0);
    expect(planner.take(T0 + GATHER_MS, keys(first), prefs)).toHaveLength(1);

    const next = [stuck('A')];
    planner.offer(next, prefs, T0 + 60_000);
    expect(planner.take(T0 + 60_000 + GATHER_MS, keys(next), prefs)).toEqual([]);
    expect(planner.hasPending()).toBe(true);
    expect(planner.take(T0 + GATHER_MS + ITEM_COOLDOWN_MS, keys(next), prefs)).toEqual([
      { kind: 'stuck', item: 'A', title: 'Title A', by: 'codex' },
    ]);
  });

  it('sends the other items of a burst while one waits out its few minutes', () => {
    planner.offer([turn('A')], prefs, T0);
    planner.take(T0 + GATHER_MS, keys([turn('A')]), prefs);

    const burst = [stuck('A'), turn('B')];
    planner.offer(burst, prefs, T0 + 30_000);
    expect(planner.take(T0 + 30_000 + GATHER_MS, keys(burst), prefs)).toEqual([
      { kind: 'turn', item: 'B', title: 'Title B' },
    ]);
    expect(planner.hasPending()).toBe(true);
  });

  it('leaves out the kinds turned off', () => {
    prefs = { ...prefs, replied: false };
    const news = [replied('A'), turn('B')];
    planner.offer(news, prefs, T0);
    expect(planner.take(T0 + GATHER_MS, keys(news), prefs)).toEqual([
      { kind: 'turn', item: 'B', title: 'Title B' },
    ]);
  });

  it('keeps quiet in the quiet hours, and does not catch up after', () => {
    const night = new Planner(() => 23 * 60);
    prefs = { ...prefs, quiet: { from: '22:00', to: '08:00' } };
    night.offer([turn('A')], prefs, T0);
    expect(night.take(T0 + GATHER_MS, keys([turn('A')]), prefs)).toEqual([]);
    expect(night.hasPending()).toBe(false);
  });
});
