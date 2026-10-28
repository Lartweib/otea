import { describe, expect, it } from 'vitest';
import { activeLease } from './lease.ts';

const lease = { holder: 'claude', expiresAt: '2026-10-28T14:30:00.000Z' };

describe('lease', () => {
  it('keeps a lease that has not expired yet', () => {
    expect(activeLease(lease, Date.parse('2026-10-28T14:29:59.999Z'))).toBe(lease);
  });

  it('drops a lease once it expires, as the server does', () => {
    expect(activeLease(lease, Date.parse('2026-10-28T14:30:00.000Z'))).toBeNull();
    expect(activeLease(lease, Date.parse('2026-10-28T15:00:00.000Z'))).toBeNull();
  });

  it('has nothing to drop when there is no lease', () => {
    expect(activeLease(null, 0)).toBeNull();
  });
});
