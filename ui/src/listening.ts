import { activeLease } from './active-lease.ts';
import { t } from './i18n/i18n.ts';
import type { Agent } from './presence.ts';
import type { Item } from './types.ts';

// Whether the desk is heard (PLAN5 G3): only an agent waiting in otea wait wakes for what the person
// does here. One idle in its chat, even with its MCP server open, hears nothing until it is told to
// go on, so an approval or an answer would sit there with the item reading as on its way.

// An agent that acted this recently is at work: it reads the item again when it next asks Otea.
const AT_WORK_MS = 150_000;

// Whether any agent waits now. Before presence loads, or from a server that does not say, it is
// taken as yes: the desk never warns of a silence it cannot tell.
export function anyoneWaits(agents: readonly Agent[] | null | undefined): boolean {
  if (!agents) return true;
  return agents.some((a) => a.waiting !== false);
}

// The agents at work now (P7-R2-12): each holds an item it acted on lately, and not one that only
// waits for your answer. While one is, an item nobody hears waits its turn in a queue: the desk
// says so calmly, not as an alarm.
export function busyAgents(
  agents: readonly Agent[] | null | undefined,
  items: readonly Pick<Item, 'id' | 'asks'>[],
  now: number,
): string[] {
  return (agents ?? [])
    .filter((a) => a.live && now - (Date.parse(a.lastSeen) || 0) <= AT_WORK_MS)
    .filter((a) => a.holding.some((id) => !items.find((it) => it.id === id)?.asks))
    .map((a) => a.name);
}

// What the desk says of an item nobody hears: «nadie está escuchando» (a warning), or, while an
// agent is at work on another item, that it waits in the queue for it (calm).
export function unheardWords(busy: readonly string[]): { text: string; calm: boolean } {
  if (busy.length === 0) return { text: t('listen.none'), calm: false };
  return { text: t('listen.busy', { count: busy.length, agent: busy[0] ?? '' }), calm: true };
}

// The same, as a sentence for the item's header.
export function unheardLead(busy: readonly string[]): string {
  if (busy.length === 0) return t('listen.lead');
  return t('listen.busyLead', { count: busy.length, agent: busy[0] ?? '' });
}

// Whether an item waits for an agent that nobody will bring: on the agent turn, no agent waiting,
// and no agent at work on it (none holds it, or its holder has gone idle).
export function unheard(
  item: Pick<Item, 'turn' | 'lease'>,
  agents: readonly Agent[] | null | undefined,
  now: number,
): boolean {
  if (item.turn !== 'agent' || anyoneWaits(agents)) return false;
  const lease = activeLease(item.lease, now);
  if (!lease) return true;
  const holder = agents?.find((a) => a.name === lease.holder);
  return !holder || now - (Date.parse(holder.lastSeen) || 0) > AT_WORK_MS;
}
