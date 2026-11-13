import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { ago, inMinutes, item, NOW } from './fixtures.ts';
import { whenText } from './when.ts';

afterEach(() => setLanguage('en'));

const held = (minutes: number) =>
  item({ id: 'A', turn: 'agent', lease: { holder: 'mender', expiresAt: inMinutes(minutes) } });

describe('when, as a row says it', () => {
  it('says the time left on the lease of an agent at work', () => {
    setLanguage('es');
    expect(whenText(held(102), NOW)).toEqual({ text: 'quedan 1 h 42 min', warn: false });
    expect(whenText(held(125), NOW)).toEqual({ text: 'quedan 2 h', warn: false });
    expect(whenText(held(9), NOW)).toEqual({ text: 'quedan 9 min', warn: false });
    setLanguage('en');
    expect(whenText(held(102), NOW)).toEqual({ text: '1 h 42 min left', warn: false });
  });

  it('says a lease ran out, in warn', () => {
    setLanguage('es');
    const lapsed = item({
      id: 'A',
      turn: 'agent',
      expiredLease: { holder: 'kiln', expiresAt: ago(12) },
    });
    expect(whenText(lapsed, NOW)).toEqual({ text: 'vencida', warn: true });
  });

  it('else says how long it has been where it is', () => {
    setLanguage('es');
    expect(whenText(item({ id: 'A', updatedAt: ago(0.4) }), NOW).text).toBe('ahora');
    expect(whenText(item({ id: 'A', updatedAt: ago(12) }), NOW).text).toBe('12 min');
    expect(whenText(item({ id: 'A', updatedAt: ago(170) }), NOW).text).toBe('3 h');
    expect(whenText(item({ id: 'A', updatedAt: ago(1500) }), NOW).text).toBe('ayer');
    expect(whenText(item({ id: 'A', updatedAt: ago(4320) }), NOW).text).toBe('3 días');
    setLanguage('en');
    expect(whenText(item({ id: 'A', updatedAt: ago(1500) }), NOW).text).toBe('yesterday');
    expect(whenText(item({ id: 'A', updatedAt: ago(4320) }), NOW).text).toBe('3 days');
  });
});
