import { isClosed, isLandStep, positionOf } from '../../src/core/board/engine.ts';
import type { BoardDefinition } from '../../src/core/board/model.ts';
import { activeLease } from './active-lease.ts';
import { t } from './i18n/i18n.ts';
import type { Agent } from './presence.ts';
import type { Item, ItemEvent } from './types.ts';

// Whether the desk is heard (PLAN5 G3): only an agent waiting in otea wait wakes for what the person
// does here. One idle in its chat, even with its MCP server open, hears nothing until it is told to
// go on, so an approval or an answer would sit there with the item reading as on its way.

// An agent that called Otea this recently is at work: it reads the item again when it next asks
// Otea. The server's listening window: within it, it counts the agent connected too.
const AT_WORK_MS = 150_000;

// Whether any agent waits now. Before presence loads, or from a server that does not say, it is
// taken as yes: the desk never warns of a silence it cannot tell.
export function anyoneWaits(agents: readonly Agent[] | null | undefined): boolean {
  if (!agents) return true;
  return agents.some((a) => a.waiting !== false);
}

// Whether a move the person can make here lands the item on an agent: only then does it matter
// that nobody listens. On a step of their own that closes the item or keeps it theirs, the desk
// says nothing of listening (P4-R3-5).
export function handsToAgent(
  choices: readonly ({ move: { turn: string } } | null | undefined)[],
): boolean {
  return choices.some((choice) => choice?.move.turn === 'agent');
}

// Whether the agent called Otea lately: any command, through the command line or MCP. A listener's
// beat is no call: an open MCP server is heard whether or not its agent acts, and idle in its chat,
// it hears nothing of the desk.
const calledLately = (a: Agent, now: number) =>
  !!a.actedAt && now - (Date.parse(a.actedAt) || 0) <= AT_WORK_MS;

// The agents at work now (P7-R2-9, P7-R2-12): each is connected, which the server says of a holder
// only while its session is heard (P7-R3-10), and holds an item it works on, not one that only
// waits for your answer; or it called Otea lately, between two items too. While one is, what the
// person hands to an agent reaches it when it waits again, and an item nobody hears waits its turn
// in a queue: the desk says so calmly, not as an alarm.
export function workingAgents(
  agents: readonly Agent[] | null | undefined,
  items: readonly Pick<Item, 'id' | 'asks'>[],
  now: number,
): string[] {
  const asks = (id: string) => !!items.find((it) => it.id === id)?.asks;
  return (agents ?? [])
    .filter((a) => {
      if (!a.live) return false;
      if (a.holding.length > 0 && a.holding.some((id) => !asks(id))) return true;
      return calledLately(a, now);
    })
    .map((a) => a.name);
}

// The agent that holds the item's live lease while it is no longer connected (P7-R3-10): its
// session ended, or it went quiet, and the lease alone keeps the item until it runs out. Null while
// it is connected, with no live lease, or before presence loads.
export function goneHolder(
  item: Pick<Item, 'lease'>,
  agents: readonly Agent[] | null | undefined,
  now: number,
): Agent | null {
  const lease = activeLease(item.lease, now);
  const holder = lease ? agents?.find((a) => a.name === lease.holder) : undefined;
  return holder && !holder.live ? holder : null;
}

// The holder of the item's live lease when its question on it was answered and it never picked the
// answer up (P6-R3-4): no otea call since the answer, no otea wait running, past the moment it
// takes to pick it up. Its MCP server may still beat, so it can be connected; the lease alone keeps
// the item. A long step with no call reads as at work, as #477 has it: only an answer left unread
// tells it went quiet. `since`: when the answer came. Null otherwise, or before presence loads.
export function silentHolder(
  item: Pick<Item, 'lease'>,
  agents: readonly Agent[] | null | undefined,
  events: readonly Pick<ItemEvent, 'type' | 'actor' | 'at' | 'data'>[],
  now: number,
): { agent: string; since: string } | null {
  const lease = activeLease(item.lease, now);
  const holder = lease ? agents?.find((a) => a.name === lease.holder) : undefined;
  if (!holder || holder.waiting === true) return null;
  const asked = new Set(
    events
      .filter((e) => e.type === 'question_asked' && e.actor.name === holder.name)
      .map((e) => e.data.question),
  );
  const answer = events.findLast(
    (e) => e.type === 'question_answered' && asked.has(e.data.question),
  );
  if (!answer) return null;
  const since = Date.parse(answer.at) || 0;
  if (now - since < AT_WORK_MS) return null;
  if (holder.actedAt && (Date.parse(holder.actedAt) || 0) >= since) return null;
  return { agent: holder.name, since: answer.at };
}

// What the desk says beside a move that hands the item to an agent (P7-R2-9): nothing while an
// agent waits (it hears it at once); while none does, that the agents at work will see it when
// they wait again (calm), or, with none at work, that nobody is listening (the alarm).
export type Hearing = { kind: 'unheard' } | { kind: 'working'; agents: string[] };

export function hearing(
  agents: readonly Agent[] | null | undefined,
  items: readonly Pick<Item, 'id' | 'asks'>[],
  now: number,
): Hearing | null {
  if (anyoneWaits(agents)) return null;
  const working = workingAgents(agents, items, now);
  return working.length > 0 ? { kind: 'working', agents: working } : { kind: 'unheard' };
}

// What the desk says of an item nobody hears: «nadie está escuchando» (a warning), or, while an
// agent is at work on another item, that it waits in the queue for it (calm).
export function unheardWords(busy: readonly string[]): { text: string; calm: boolean } {
  if (busy.length === 0) return { text: t('listen.none'), calm: false };
  return { text: t('listen.busy', { count: busy.length, agent: busy[0] ?? '' }), calm: true };
}

// The same, as a sentence for the header of item `id`. «Busy with another item» only when each of
// them holds an item other than this one; one holding none (between two items, or claiming this
// one) is only at work (P6-R3-5).
export function unheardLead(
  busy: readonly string[],
  agents: readonly Agent[] | null | undefined,
  id: string,
): string {
  if (busy.length === 0) return t('listen.lead');
  const elsewhere = busy.every((name) =>
    agents?.find((a) => a.name === name)?.holding.some((held) => held !== id),
  );
  return t(elsewhere ? 'listen.busyLead' : 'listen.activeLead', {
    count: busy.length,
    agent: busy[0] ?? '',
  });
}

// Whether an item waits for an agent that nobody will bring: on the agent turn, no agent waiting,
// and no agent at work on it (none holds it, or its holder has gone idle or is no longer connected,
// P7-R3-10). One an agent set aside for later is not: the desk says who set it aside instead, with
// Retomar (P7-R3-1).
export function unheard(
  item: Pick<Item, 'turn' | 'lease' | 'setAside'>,
  agents: readonly Agent[] | null | undefined,
  now: number,
): boolean {
  if (item.turn !== 'agent' || item.setAside || anyoneWaits(agents)) return false;
  const lease = activeLease(item.lease, now);
  if (!lease) return true;
  const holder = agents?.find((a) => a.name === lease.holder);
  return !holder?.live || now - (Date.parse(holder.lastSeen) || 0) > AT_WORK_MS;
}

// The items waiting behind `item` to land: on a board's land step (one agent lands at a time on a
// base, app/land-order.ts), the others of its board on the same step that no agent holds. What a
// silent holder keeps waiting (P6-R3-4). None off a land step, or off a board.
export function waitingToLand(
  item: Pick<Item, 'id' | 'collection' | 'state'>,
  all: readonly Pick<Item, 'id' | 'collection' | 'state' | 'lease'>[],
  def: BoardDefinition | null | undefined,
  now: number,
): string[] {
  const at = positionOf(item.state);
  if (!def || isClosed(at) || at.phase !== 'doing' || !isLandStep(def, at.step)) return [];
  return all
    .filter(
      (other) =>
        other.id !== item.id &&
        other.collection === item.collection &&
        other.state === item.state &&
        !activeLease(other.lease, now),
    )
    .map(({ id }) => id);
}
