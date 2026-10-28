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
  it('keeps a lease that has not expired yet', () => {
    expect(activeLease(lease, '2026-01-01T00:14:59.999Z')).toEqual(lease);
  });

  it('reports a lease as free from the moment it expires', () => {
    expect(activeLease(lease, '2026-01-01T00:15:00.000Z')).toBeNull();
    expect(activeLease(lease, '2026-01-01T01:00:00.000Z')).toBeNull();
  });

  it('reports no lease as free', () => {
    expect(activeLease(null, '2026-01-01T00:00:00.000Z')).toBeNull();
  });
});

describe('assertMayWrite', () => {
  const agent = (name: string): Actor => ({ kind: 'agent', name });

  it('lets anyone write an item nobody holds', () => {
    expect(() => assertMayWrite('TASKS-1', null, agent('codex'))).not.toThrow();
  });

  it('lets the holder write', () => {
    expect(() => assertMayWrite('TASKS-1', lease, agent('claude'))).not.toThrow();
  });

  it('refuses another agent with lease_held naming the holder and the expiry', () => {
    const write = () => assertMayWrite('TASKS-1', lease, agent('codex'));

    expect(write).toThrow(expect.objectContaining({ code: 'lease_held' }));
    expect(write).toThrow('TASKS-1 is held by claude until 2026-01-01T00:15:00.000Z');
  });

  it('lets a human write regardless of the lease', () => {
    expect(() => assertMayWrite('TASKS-1', lease, { kind: 'human', name: 'claude' })).not.toThrow();
    expect(() => assertMayWrite('TASKS-1', lease, { kind: 'human', name: 'ana' })).not.toThrow();
  });
});
