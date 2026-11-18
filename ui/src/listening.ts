import { activeLease } from './active-lease.ts';
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
