import type { Lease } from './types.ts';

// Same rule as the server: a lease stops counting the moment it expires, even if no write follows.
// Kept apart from lease.ts (which formats, and so pulls in i18n and React) so attention.ts stays pure
// and the desktop shell's main process can import it as it is.
export function activeLease(lease: Lease | null, now: number): Lease | null {
  return lease && Date.parse(lease.expiresAt) > now ? lease : null;
}
