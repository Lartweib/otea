import { activeLease } from './lease.ts';
import type { Item } from './types.ts';

// What the whole workspace asks of you right now, across every collection: how many items wait for
// you, and whether an agent is at work on any of them. The brand, the favicon and the title show it;
// it is derived from the items alone, so a desktop shell can derive it the same way.
export type Attention = { yours: number; working: boolean };

// The living mark's four drawings. Yours comes first (a filled counter); the orbit is added while
// an agent works.
export type AttentionFrame = 'yours' | 'yours-working' | 'working' | 'idle';

export const FAVICONS: Readonly<Record<AttentionFrame, string>> = {
  yours: '/otea-yours.svg',
  'yours-working': '/otea-yours-working.svg',
  working: '/otea-working.svg',
  idle: '/otea-idle.svg',
};

type Facts = Pick<Item, 'turn' | 'lease'>;

export function attentionOf(items: readonly Facts[], now: number): Attention {
  return {
    yours: items.filter((item) => item.turn === 'human').length,
    working: items.some((item) => activeLease(item.lease, now) !== null),
  };
}

export function attentionFrame({ yours, working }: Attention): AttentionFrame {
  if (yours > 0) return working ? 'yours-working' : 'yours';
  return working ? 'working' : 'idle';
}

// The state never lives in the mark alone: the title carries the count, "(2) Otea".
export function attentionTitle({ yours }: Attention, name = 'Otea'): string {
  return yours > 0 ? `(${yours}) ${name}` : name;
}

// Expiry writes nothing, so no change event arrives: when the working state has to be read again.
export function nextLeaseExpiry(items: readonly Facts[], now: number): number | undefined {
  const ends = items.flatMap((item) => {
    const lease = activeLease(item.lease, now);
    return lease ? [Date.parse(lease.expiresAt)] : [];
  });
  return ends.length > 0 ? Math.min(...ends) : undefined;
}
