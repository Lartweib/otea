import { describe, expect, it } from 'vitest';
import {
  attentionFrame,
  attentionOf,
  attentionTitle,
  FAVICONS,
  nextLeaseExpiry,
} from './attention.ts';
import type { Item, Lease, Turn } from './types.ts';

const NOW = Date.parse('2026-10-28T14:00:00.000Z');
const later = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const lease = (minutes: number): Lease => ({ holder: 'claude-a', expiresAt: later(minutes) });
const item = (turn: Turn, held: Lease | null = null) => ({ turn, lease: held }) as Item;

describe('attentionOf', () => {
  it('counts every item that waits for you', () => {
    const items = [item('human'), item('agent'), item('human'), item('none')];
    expect(attentionOf(items, NOW)).toEqual({ yours: 2, working: false });
  });

  it('is working while any agent holds a lease, whoever has the turn', () => {
    expect(attentionOf([item('agent', lease(5))], NOW)).toEqual({ yours: 0, working: true });
    expect(attentionOf([item('human', lease(5))], NOW)).toEqual({ yours: 1, working: true });
  });

  it('stops working the moment the last lease expires, as the server does', () => {
    expect(attentionOf([item('agent', lease(0))], NOW).working).toBe(false);
    expect(attentionOf([item('agent', lease(-5))], NOW).working).toBe(false);
  });

  it('asks nothing of an empty workspace', () => {
    expect(attentionOf([], NOW)).toEqual({ yours: 0, working: false });
  });
});

describe('attentionFrame', () => {
  it('puts yours first and adds the orbit while an agent works', () => {
    expect(attentionFrame({ yours: 2, working: false })).toBe('yours');
    expect(attentionFrame({ yours: 1, working: true })).toBe('yours-working');
    expect(attentionFrame({ yours: 0, working: true })).toBe('working');
    expect(attentionFrame({ yours: 0, working: false })).toBe('idle');
  });

  it('has a favicon for every frame', () => {
    expect(FAVICONS).toEqual({
      yours: '/otea-yours.svg',
      'yours-working': '/otea-yours-working.svg',
      working: '/otea-working.svg',
      idle: '/otea-idle.svg',
    });
  });
});

describe('attentionTitle', () => {
  it('leads with the count of what waits for you', () => {
    expect(attentionTitle({ yours: 2, working: false })).toBe('(2) Otea');
    expect(attentionTitle({ yours: 1, working: true })).toBe('(1) Otea');
  });

  it('is the plain name when nothing is yours, working or not', () => {
    expect(attentionTitle({ yours: 0, working: true })).toBe('Otea');
    expect(attentionTitle({ yours: 0, working: false })).toBe('Otea');
  });
});

describe('nextLeaseExpiry', () => {
  it('is when the first active lease runs out', () => {
    const items = [item('agent', lease(10)), item('agent', lease(3)), item('human')];
    expect(nextLeaseExpiry(items, NOW)).toBe(Date.parse(later(3)));
  });

  it('ignores leases that already expired, and has none to wait for without one', () => {
    expect(nextLeaseExpiry([item('agent', lease(-1))], NOW)).toBeUndefined();
    expect(nextLeaseExpiry([item('agent')], NOW)).toBeUndefined();
  });
});
