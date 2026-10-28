import type { Lease } from './types.ts';

// Same rule as the server: a lease stops counting the moment it expires, even if no write follows.
export function activeLease(lease: Lease | null, now: number): Lease | null {
  return lease && Date.parse(lease.expiresAt) > now ? lease : null;
}
