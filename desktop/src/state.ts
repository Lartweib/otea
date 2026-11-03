import { activeLease } from '../../ui/src/active-lease.ts';
import {
  type Attention,
  type AttentionFrame,
  attentionFrame,
  attentionOf,
  nextLeaseExpiry,
} from '../../ui/src/attention.ts';

// What the shell needs from an item, as /api/items returns it.
export type DeskItem = {
  id: string;
  collection: string;
  title: string;
  turn: 'human' | 'agent' | 'none';
  updatedAt: string;
  lease: { holder: string; expiresAt: string } | null;
};

export type CollectionCount = { name: string; yours: number; working: number };

// The page's Attention plus what the desktop adds: how many agents hold an active lease, the three
// most recent items that became yours, and the counts per collection for the tray menu.
export type DeskAttention = Attention & {
  frame: AttentionFrame;
  agents: number;
  recentYours: DeskItem[];
  collections: CollectionCount[];
};

const RECENT = 3;

export function deskAttention(
  items: readonly DeskItem[],
  collections: readonly string[],
  now: number,
): DeskAttention {
  const attention = attentionOf(items, now);
  const live = (item: DeskItem) => activeLease(item.lease, now);
  const holders = new Set(items.flatMap((item) => live(item)?.holder ?? []));
  const recentYours = items
    .filter((item) => item.turn === 'human')
    .toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, RECENT);
  const names = [...new Set([...collections, ...items.map((item) => item.collection)])];
  return {
    ...attention,
    frame: attentionFrame(attention),
    agents: holders.size,
    recentYours,
    collections: names.map((name) => {
      const own = items.filter((item) => item.collection === name);
      return {
        name,
        yours: own.filter((item) => item.turn === 'human').length,
        working: own.filter((item) => live(item) !== null).length,
      };
    }),
  };
}

// An expiring lease writes nothing, so the shell re-derives when the first one runs out.
export { nextLeaseExpiry };

// "Something new became yours": the only trigger for the flash and the bounce.
export function grew(previous: DeskAttention | undefined, next: DeskAttention): boolean {
  return next.yours > (previous?.yours ?? 0);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function parts({ yours, agents }: DeskAttention): string[] {
  const out: string[] = [];
  if (yours > 0) out.push(`${yours} yours`);
  if (agents > 0) out.push(`${plural(agents, 'agent', 'agents')} working`);
  return out;
}

// The tray tooltip: "Otea — 3 yours, 1 agent working", "Otea — nothing is yours".
export function tooltip(attention: DeskAttention): string {
  const said = parts(attention);
  return `Otea — ${said.length > 0 ? said.join(', ') : 'nothing is yours'}`;
}

// The tray menu's header: the state in words.
export function menuHeader(attention: DeskAttention): string {
  const said = parts(attention);
  return said.length > 0 ? said.join(' · ') : 'Nothing is yours';
}

export type Overlay = { kind: 'yours' | 'working'; description: string } | null;

// The taskbar overlay: yours wins over working; nothing yours and nobody working is no overlay.
export function overlayOf({ yours, working }: DeskAttention): Overlay {
  if (yours > 0) {
    return { kind: 'yours', description: `${plural(yours, 'item is', 'items are')} yours` };
  }
  return working ? { kind: 'working', description: 'An agent is working' } : null;
}

// The Dock badge: the count of yours, "99+" past 99, empty at zero.
export function badgeText(yours: number): string {
  if (yours <= 0) return '';
  return yours > 99 ? '99+' : String(yours);
}

// A collection's label in the tray menu, its counts in words.
export function collectionLabel({ name, yours, working }: CollectionCount): string {
  const said: string[] = [];
  if (yours > 0) said.push(`${yours} yours`);
  if (working > 0) said.push(`${working} working`);
  return `${name} · ${said.length > 0 ? said.join(' · ') : 'nothing yours'}`;
}

// What the tray, the overlay and the menu have to be redrawn for; equal keys are a no-op.
export function surfaceKey(attention: DeskAttention): string {
  return JSON.stringify([
    attention.frame,
    attention.yours,
    attention.agents,
    attention.recentYours.map((item) => [item.id, item.title]),
    attention.collections,
  ]);
}
