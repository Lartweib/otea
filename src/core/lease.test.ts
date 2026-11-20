import { describe, expect, it } from 'vitest';
import type { Actor } from './item.ts';
import { activeLease, assertMayWrite, leaseExpiry, parseDuration } from './lease.ts';

const lease = { holder: 'claude', expiresAt: '2026-01-01T00:15:00.000Z' };

describe('parseDuration', () => {
  it.each([
    ['90s', 90_000],
    ['15m', 900_000],
    ['1h', 3_600_000],
  ])('parses %s', (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });

  it.each(['0s', '0m', '15', 'm', '1.5h', '-1m', '1d', ' 15m', 'soon', ''])(
    'rejects %j',
    (text) => {
      expect(parseDuration(text)).toBeUndefined();
    },
  );
});

describe('leaseExpiry', () => {
  it('adds the ttl to the time of the claim', () => {
    expect(leaseExpiry('2026-01-01T00:00:00.000Z', 90_000)).toBe('2026-01-01T00:01:30.000Z');
  });
});

describe('activeLease', () => {
  // A lease is free from the moment it expires.
  it.each([
    ['keeps a lease that has not expired yet', lease, '2026-01-01T00:14:59.999Z', lease],
    ['frees a lease at its expiry', lease, '2026-01-01T00:15:00.000Z', null],
    ['frees a lease after its expiry', lease, '2026-01-01T01:00:00.000Z', null],
    ['reports no lease as free', null, '2026-01-01T00:00:00.000Z', null],
  ])('%s', (_, held, now, expected) => {
    expect(activeLease(held, now)).toEqual(expected);
  });
});

describe('assertMayWrite', () => {
  const agent = (name: string): Actor => ({ kind: 'agent', name });

  it.each<[string, typeof lease | null, Actor]>([
    ['lets anyone write an item nobody holds', null, agent('codex')],
    ['lets the holder write', lease, agent('claude')],
    [
      'lets a human named as the holder write regardless of the lease',
      lease,
      { kind: 'human', name: 'claude' },
    ],
    ['lets any human write regardless of the lease', lease, { kind: 'human', name: 'ana' }],
  ])('%s', (_, held, actor) => {
    expect(() => assertMayWrite('TASKS-1', held, actor)).not.toThrow();
  });

  it('refuses another agent with lease_held naming the holder and the expiry', () => {
    const write = () => assertMayWrite('TASKS-1', lease, agent('codex'));

    expect(write).toThrow(expect.objectContaining({ code: 'lease_held' }));
    expect(write).toThrow('TASKS-1 is held by claude until 2026-01-01 00:15 UTC');
  });
});
