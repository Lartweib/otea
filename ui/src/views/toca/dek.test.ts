import { afterEach, describe, expect, it } from 'vitest';
import { agent, ago, item, MIN, moved, NOW, officialType, you } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { atascoDek, oldestWaiting, quietOnes, tocaDek } from './dek.ts';
import { todayCounts } from './today.ts';
import { numberWord, sinceText, spanText } from './words.ts';

afterEach(() => setLanguage('en'));

const bug = officialType('bug-triage');
const ctx = (items = [item({ id: 'A' })]) => ({ now: NOW, items, types: () => bug });

describe('words', () => {
  it('writes counts as words up to thirteen, then as digits', () => {
    setLanguage('es');
    expect(numberWord(1)).toBe('una');
    expect(numberWord(3, true)).toBe('Tres');
    expect(numberWord(13)).toBe('trece');
    expect(numberWord(14)).toBe('14');
    setLanguage('en');
    expect(numberWord(5)).toBe('five');
  });

  it('says how long, the way a person does', () => {
    setLanguage('es');
    expect(spanText(12 * MIN)).toBe('12 min');
    expect(spanText(130 * MIN)).toBe('2 h');
    expect(spanText(3 * 1440 * MIN)).toBe('3 días');
    expect(sinceText(20_000)).toBe('desde hace un momento');
    expect(sinceText(14 * MIN)).toBe('desde hace 14 min');
    expect(sinceText(120 * MIN)).toBe('desde hace 2 h');
    expect(sinceText(1500 * MIN)).toBe('desde ayer');
    expect(sinceText(3 * 1440 * MIN)).toBe('desde hace 3 días');
  });
});

describe('what happened today', () => {
  it('counts what agents handed you, what you approved and what you sent back with notes', () => {
    const items = [
      item({ id: 'A', state: 'verify' }),
      item({ id: 'B', state: 'fixing', turn: 'agent' }),
      item({ id: 'C', state: 'fixed', turn: 'none' }),
      item({ id: 'D', state: 'rejected', turn: 'none' }),
    ];
    const feed = [
      moved('A', 'verify', agent('mender'), { minutes: 50 }),
      moved('A', 'verify', agent('mender'), { minutes: 60 * 30 }), // yesterday
      moved('B', 'fixing', agent('kiln'), { minutes: 40, from: 'accepted' }), // not to you
      moved('B', 'fixing', you, { minutes: 30, from: 'verify', reason: 'Falta el carro.' }),
      moved('C', 'fixed', you, { minutes: 20, from: 'verify' }),
      moved('B', 'accepted', agent('kiln'), { minutes: 10, from: 'reported', via: 'kiln' }),
      moved('D', 'rejected', you, { minutes: 5, from: 'reported' }), // discarded: neither
      moved('B', 'fixing', you, { minutes: 4, from: 'needs_info', reason: 'migrate' }), // a reading
      moved('C', 'fixed', you, { minutes: 3, from: 'verify', reason: 'migrate' }), // a reading
    ];
    expect(todayCounts(feed, ctx(items))).toEqual({ handed: 1, approved: 2, sent: 1 });
  });
});

describe('the dek of Te toca', () => {
  it('says how many wait for you, since when the oldest, and what the agents handed over', () => {
    setLanguage('es');
    const items = [
      item({ id: 'A', updatedAt: ago(14) }),
      item({ id: 'B', updatedAt: ago(130) }),
      item({
        id: 'C',
        turn: 'agent',
        state: 'fixing',
        expiredLease: { holder: 'kiln', expiresAt: ago(20) },
      }),
      item({ id: 'D', turn: 'agent', state: 'fixing' }),
    ];
    expect(oldestWaiting(items, NOW)).toBe(130 * MIN);
    expect(tocaDek(items, 5, NOW)).toEqual({
      lead: 'Tres cosas esperan por ti; la más antigua, desde hace 2 h.',
      handed: { before: 'Los agentes entregaron ', n: 'cinco', after: ' hoy.' },
    });
    expect(tocaDek([items[0] as never], 1, NOW).lead).toBe(
      'Una cosa espera por ti desde hace 14 min.',
    );
    expect(tocaDek([], 0, NOW)).toEqual({
      lead: 'Nada espera por ti.',
      handed: { before: 'Los agentes no entregaron nada hoy.', n: '', after: '' },
    });
  });

  it('says in Atasco who went quiet, and since when', () => {
    setLanguage('es');
    const items = [
      item({
        id: 'A',
        turn: 'agent',
        state: 'fixing',
        expiredLease: { holder: 'Kiln', expiresAt: ago(12) },
      }),
      item({ id: 'B', updatedAt: ago(5) }),
    ];
    expect(quietOnes(items, NOW)).toEqual([{ agent: 'Kiln', since: 12 * MIN }]);
    expect(atascoDek(items, NOW)).toEqual({
      lead: 'Una cosa se quedó quieta: ',
      quiet: [{ agent: 'Kiln', text: ' no da señales desde hace 12 min' }],
    });
    expect(atascoDek([], NOW)).toEqual({
      lead: 'Nada parado: los agentes siguen dando señales.',
      quiet: [],
    });
  });
});
