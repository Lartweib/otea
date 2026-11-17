import { activeLease } from '../../ui/src/active-lease.ts';
import {
  type Attention,
  type AttentionFrame,
  attentionFrame,
  attentionOf,
  nextLeaseExpiry,
} from '../../ui/src/attention.ts';
import type { Lang } from './copy.ts';

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

const one = (count: number, single: string, many: string) =>
  `${count} ${count === 1 ? single : many}`;

// The tray's, the overlay's and the menu's words, in the language of the system (as copy.ts).
const WORDS: Record<
  Lang,
  {
    yours: (count: number) => string;
    agents: (count: number) => string;
    working: (count: number) => string;
    itemsYours: (count: number) => string;
    nothing: string;
    nothingHeader: string;
    nothingInCollection: string;
    agentWorking: string;
    reconnecting: string;
  }
> = {
  en: {
    yours: (count) => `${count} yours`,
    agents: (count) => `${one(count, 'agent', 'agents')} working`,
    working: (count) => `${count} working`,
    itemsYours: (count) => `${one(count, 'item is', 'items are')} yours`,
    nothing: 'nothing is yours',
    nothingHeader: 'Nothing is yours',
    nothingInCollection: 'nothing yours',
    agentWorking: 'An agent is working',
    reconnecting: 'Otea — reconnecting to otea serve',
  },
  es: {
    yours: (count) => one(count, 'te toca', 'te tocan'),
    agents: (count) => `${one(count, 'agente', 'agentes')} trabajando`,
    working: (count) => `${count} trabajando`,
    itemsYours: (count) => one(count, 'ítem te toca', 'ítems te tocan'),
    nothing: 'nada te toca',
    nothingHeader: 'Nada te toca',
    nothingInCollection: 'nada te toca',
    agentWorking: 'Un agente está trabajando',
    reconnecting: 'Otea — reconectando con otea serve',
  },
};

function parts({ yours, agents }: DeskAttention, lang: Lang): string[] {
  const words = WORDS[lang];
  const out: string[] = [];
  if (yours > 0) out.push(words.yours(yours));
  if (agents > 0) out.push(words.agents(agents));
  return out;
}

// The tray tooltip: "Otea — 3 yours, 1 agent working", "Otea — nothing is yours".
export function tooltip(attention: DeskAttention, lang: Lang): string {
  const said = parts(attention, lang);
  return `Otea — ${said.length > 0 ? said.join(', ') : WORDS[lang].nothing}`;
}

// The tooltip while the live stream from otea serve is down.
export const reconnectingTooltip = (lang: Lang): string => WORDS[lang].reconnecting;

// The tray menu's header: the state in words.
export function menuHeader(attention: DeskAttention, lang: Lang): string {
  const said = parts(attention, lang);
  return said.length > 0 ? said.join(' · ') : WORDS[lang].nothingHeader;
}

export type Overlay = { kind: 'yours' | 'working'; description: string } | null;

// The taskbar overlay: yours wins over working; nothing yours and nobody working is no overlay.
export function overlayOf({ yours, working }: DeskAttention, lang: Lang): Overlay {
  if (yours > 0) return { kind: 'yours', description: WORDS[lang].itemsYours(yours) };
  return working ? { kind: 'working', description: WORDS[lang].agentWorking } : null;
}

// The Dock badge: the count of yours, "99+" past 99, empty at zero.
export function badgeText(yours: number): string {
  if (yours <= 0) return '';
  return yours > 99 ? '99+' : String(yours);
}

// A collection's label in the tray menu, its counts in words.
export function collectionLabel({ name, yours, working }: CollectionCount, lang: Lang): string {
  const words = WORDS[lang];
  const said: string[] = [];
  if (yours > 0) said.push(words.yours(yours));
  if (working > 0) said.push(words.working(working));
  return `${name} · ${said.length > 0 ? said.join(' · ') : words.nothingInCollection}`;
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
