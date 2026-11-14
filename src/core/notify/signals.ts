// What is worth a notification (a push to a phone, a desktop notification), read from the items as
// the lists show them. Each signal has a key that stays the same while the thing it says holds, so
// comparing two looks finds what is new:
// - turn: an item is yours (a review, your own step, or an agent's question via otea ask);
// - replied: an agent answered one of your notes (otea reply);
// - stuck: an agent's lease ran out with nobody releasing it or taking the item again.

export const NOTIFY_KINDS = ['turn', 'replied', 'stuck'] as const;

export type NotifyKind = (typeof NOTIFY_KINDS)[number];

type Lease = { holder: string; expiresAt: string };

// What an item says about itself in /api/items.
export type NotifyFacts = {
  id: string;
  title: string;
  state: string;
  turn: 'human' | 'agent' | 'none';
  round?: number;
  lease: Lease | null;
  expiredLease?: Lease;
  asks?: { question: number; by: string };
  notes?: { replied?: { note: number; by: string; at: string } };
};

export type Signal = {
  key: string;
  kind: NotifyKind;
  item: string;
  title: string;
  // Who asks (a question), answered, or went quiet.
  by?: string;
  // The turn is yours because an agent asks you something.
  asks?: true;
};

const active = (lease: Lease | null, now: number) =>
  lease !== null && Date.parse(lease.expiresAt) > now;

export function signalsOf(items: readonly NotifyFacts[], now: number): Signal[] {
  const out: Signal[] = [];
  for (const facts of items) {
    const { id: item, title } = facts;
    if (facts.turn === 'human') {
      const base = `turn:${item}:${facts.state}:${facts.round ?? ''}`;
      out.push(
        facts.asks
          ? {
              key: `${base}:q${facts.asks.question}`,
              kind: 'turn',
              item,
              title,
              by: facts.asks.by,
              asks: true,
            }
          : { key: base, kind: 'turn', item, title },
      );
    }
    const quiet = facts.expiredLease;
    if (facts.turn === 'agent' && quiet && !active(facts.lease, now)) {
      out.push({
        key: `stuck:${item}:${quiet.holder}:${quiet.expiresAt}`,
        kind: 'stuck',
        item,
        title,
        by: quiet.holder,
      });
    }
    const replied = facts.notes?.replied;
    if (replied) {
      out.push({
        key: `replied:${item}:${replied.note}:${replied.at}`,
        kind: 'replied',
        item,
        title,
        by: replied.by,
      });
    }
  }
  return out;
}

// The signals that were not there the last time; the first look (`before` undefined) is where
// watching starts, so a server that starts or a phone that subscribes is not told the past.
export function freshSignals(
  before: ReadonlySet<string> | undefined,
  now: readonly Signal[],
): Signal[] {
  if (before === undefined) return [];
  return now.filter(({ key }) => !before.has(key));
}
