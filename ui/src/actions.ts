import { relayOf } from './format.ts';
import { t } from './i18n/i18n.ts';
import type { ButtonVariant } from './kit/Button.tsx';
import type { ChildrenSummary, ItemEvent, Move, RelatedItem } from './types.ts';

export type Tone = 'approve' | 'caution' | 'neutral';

export function moveTone({ by, reasonRequired }: Move): Tone {
  if (reasonRequired) return 'caution';
  return by === 'agent' ? 'neutral' : 'approve';
}

// What a move may wait for: the item's children summary and how many items that block it are open.
export type Waits = { children?: ChildrenSummary | undefined; blockers?: number | undefined };

// The open blockers among an item's relations, as the detail reads them.
export function openBlockers(relations: readonly RelatedItem[]): number {
  return relations.filter(({ kind, closes }) => kind === 'blocked_by' && closes === undefined)
    .length;
}

// What an item's moves wait for, from its detail.
export function waitsOf(item: {
  children?: ChildrenSummary;
  relations: readonly RelatedItem[];
}): Waits {
  return { children: item.children, blockers: openBlockers(item.relations) };
}

// Why a move cannot be made yet: it enters a state that waits for every child
// (requires: children_closed) while some are open, or for everything that blocks the item
// (requires: blockers_closed) while some of it is open, closing or not. The server refuses it too.
export function moveBlock(move: Move, waits: Waits = {}): string | undefined {
  const children = waits.children?.open ?? 0;
  const blockers = waits.blockers ?? 0;
  const parts: string[] = [];
  if (move.requires?.includes('children_closed') && children > 0) {
    parts.push(t('move.waits', { count: children }));
  }
  if (move.requires?.includes('blockers_closed') && blockers > 0) {
    parts.push(
      t(parts.length > 0 ? 'move.andBlockers' : 'move.waitsBlockers', { count: blockers }),
    );
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

// One primary per screen: the first move that hands the turn on. Throwing work away is never the
// primary, nor is a move still waiting for children or blockers: the next eligible one takes it.
export function moveVariants(moves: readonly Move[], waits?: Waits): ButtonVariant[] {
  let primaryTaken = false;
  return moves.map((move) => {
    if (move.closes === 'discarded') return 'quiet';
    if (moveBlock(move, waits) !== undefined) return 'default';
    if (!primaryTaken && moveTone(move) === 'approve') {
      primaryTaken = true;
      return 'primary';
    }
    return 'default';
  });
}

// The agent a move would hand the item to: the last one that acted on it (or relayed your words).
export function turnAgent(events: readonly ItemEvent[]): string | undefined {
  for (const event of [...events].reverse()) {
    const relay = relayOf(event);
    if (relay) return relay.via;
    if (event.actor.kind === 'agent') return event.actor.name;
  }
  return undefined;
}
