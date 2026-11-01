import { ageLabel, relayOf } from './format.ts';
import { groupRelations } from './relations.ts';
import type { ItemEvent, RelatedItem } from './types.ts';

// The handoff line under the detail's title: who handed the item over, when and what they said,
// read from its last move (or its creation, while nothing moved it). Only what the events hold:
// a move says its target state, never a verb Otea would have to guess from a state's name.
export type Handoff = {
  who: string;
  // The agent whose mark goes with it; none for you.
  agent: string | null;
  says: string;
  at: string;
  // The reason the move carried, or the words of yours an agent relayed.
  note: string | null;
};

export function handoffOf(events: readonly ItemEvent[]): Handoff | null {
  const last = events.findLast(({ type }) => type === 'transitioned' || type === 'created');
  if (!last) return null;
  const relay = relayOf(last);
  const to = String(last.data.to);
  if (relay) {
    return {
      who: relay.via,
      agent: relay.via,
      says: `${relay.via} relayed your move to ${to}`,
      at: last.at,
      note: relay.quote,
    };
  }
  const yours = last.actor.kind === 'human';
  const who = yours ? 'you' : last.actor.name;
  const reason = last.data.reason;
  return {
    who,
    agent: yours ? null : who,
    says: last.type === 'created' ? `${who} created it` : `${who} moved it to ${to}`,
    at: last.at,
    note: typeof reason === 'string' && reason !== '' ? reason : null,
  };
}

// How long ago, as a sentence says it: just now, 14m ago, 3h ago, yesterday, 5d ago.
export function agoLabel(iso: string, now: number): string {
  const age = ageLabel(iso, now);
  if (age === 'now') return 'just now';
  return age === 'yesterday' || age === '' ? age : `${age} ago`;
}

// A parent's children on your turn, as the handoff line links them.
export function waitingChildren(relations: readonly RelatedItem[]): RelatedItem[] {
  return relations.filter(({ kind, turn }) => kind === 'child' && turn === 'human');
}

// The one relation the handoff line names: the first the detail lists, children aside.
export function leadRelation(
  relations: readonly RelatedItem[],
): { label: string; item: RelatedItem } | undefined {
  const [group] = groupRelations(relations, { withChildren: false });
  const item = group?.items[0];
  return group && item ? { label: group.label, item } : undefined;
}
