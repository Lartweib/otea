import { OteaError } from './errors.ts';
import type { Actor } from './item.ts';

export type Lease = { holder: string; expiresAt: string };

export const DEFAULT_LEASE_TTL_MS = 15 * 60_000;

const DURATION_PATTERN = /^([1-9][0-9]*)(s|m|h)$/;

const UNIT_MS: Readonly<Record<string, number>> = { s: 1000, m: 60_000, h: 3_600_000 };

export function parseDuration(text: string): number | undefined {
  const match = DURATION_PATTERN.exec(text);
  if (!match?.[1] || !match[2]) return undefined;
  return Number(match[1]) * (UNIT_MS[match[2]] ?? 0);
}

export function leaseExpiry(at: string, ttlMs: number): string {
  return new Date(Date.parse(at) + ttlMs).toISOString();
}

// Expiry is lazy: an expired lease stays stored and simply reads as free.
export function activeLease(lease: Lease | null, at: string): Lease | null {
  return lease && Date.parse(lease.expiresAt) > Date.parse(at) ? lease : null;
}

export function leaseHeld(id: string, lease: Lease): OteaError {
  return new OteaError('lease_held', `${id} is held by ${lease.holder} until ${lease.expiresAt}`);
}

// Humans lead: only agents are bound by another actor's lease.
export function assertMayWrite(id: string, lease: Lease | null, actor: Actor): void {
  if (actor.kind === 'agent' && lease && lease.holder !== actor.name) throw leaseHeld(id, lease);
}
