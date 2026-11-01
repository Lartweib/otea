import { describe, expect, it } from 'vitest';
import { activeLease, leaseLeft, timeCell } from './lease.ts';

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

describe('leaseLeft', () => {
  const at = (iso: string) => leaseLeft(lease, Date.parse(iso));

  it('counts the minutes left, rounded up, so it never says 0m', () => {
    expect(at('2026-10-28T14:18:00.000Z')).toBe('12m left');
    expect(at('2026-10-28T14:17:30.000Z')).toBe('13m left');
    expect(at('2026-10-28T14:29:59.000Z')).toBe('1m left');
  });

  it('says hours from an hour left, and days from a day', () => {
    expect(at('2026-10-28T13:30:00.000Z')).toBe('1h left');
    expect(at('2026-10-28T11:45:00.000Z')).toBe('2h left');
    expect(at('2026-10-26T14:00:00.000Z')).toBe('2d left');
  });

  it('says expired once the lease runs out', () => {
    expect(at('2026-10-28T14:30:00.000Z')).toBe('expired');
    expect(at('2026-10-29T09:00:00.000Z')).toBe('expired');
  });
});

describe('timeCell', () => {
  const item = (held: { holder: string; expiresAt: string } | null) => ({
    updatedAt: '2026-10-28T13:00:00.000Z',
    lease: held,
  });
  const held = { holder: 'claude-b', expiresAt: '2026-10-28T14:30:00.000Z' };
  const now = Date.parse('2026-10-28T14:18:00.000Z');

  it('keeps the age for an item without a lease', () => {
    expect(timeCell(item(null), now, 'UTC')).toEqual({ tone: 'age', text: '1h' });
  });

  it('shows the time left on an active lease, the holder and the expiry in its label', () => {
    expect(timeCell(item(held), now, 'UTC')).toEqual({
      tone: 'left',
      text: '12m left',
      label: 'held by claude-b until 14:30',
      changesAt: Date.parse('2026-10-28T14:19:00.000Z'),
    });
  });

  it('names the day of an expiry that is not today', () => {
    const long = { holder: 'claude-b', expiresAt: '2026-10-30T09:00:00.000Z' };
    expect(timeCell(item(long), now, 'UTC')).toMatchObject({
      label: 'held by claude-b until 30 Oct, 09:00',
    });
  });

  it('changes when its text would: the next minute, hour or day, then the expiry', () => {
    const at = (now: string, changesAt: string) =>
      expect(timeCell(item(held), Date.parse(now), 'UTC')).toMatchObject({
        changesAt: Date.parse(changesAt),
      });
    at('2026-10-28T14:29:30.000Z', '2026-10-28T14:30:00.000Z');
    at('2026-10-28T12:00:00.000Z', '2026-10-28T12:31:00.000Z');
    at('2026-10-26T12:00:00.000Z', '2026-10-26T14:31:00.000Z');
  });

  it('says a lease that ran out without a release has expired, and stops changing', () => {
    const expired = {
      tone: 'expired',
      text: 'expired',
      label: 'held by claude-b, its lease expired at 14:30',
    };
    const later = Date.parse('2026-10-28T15:00:00.000Z');
    // Run out while shown, or served as such (the server keeps it apart from an active lease).
    expect(timeCell(item(held), later, 'UTC')).toEqual(expired);
    expect(timeCell({ ...item(null), expiredLease: held }, later, 'UTC')).toEqual(expired);
  });
});
