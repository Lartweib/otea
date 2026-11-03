import { relayOf } from './format.ts';
import { t } from './i18n/i18n.ts';
import type { ButtonVariant } from './kit/Button.tsx';
import type { ChildrenSummary, ItemEvent, Move, Turn } from './types.ts';

export type ActionState =
  | { step: 'choosing'; error?: string }
  | { step: 'explaining'; to: string; reason: string; error?: string }
  | { step: 'posting'; to: string; reason: string };

export type ActionEvent =
  | { type: 'explain'; to: string }
  | { type: 'type'; reason: string }
  | { type: 'cancel' }
  | { type: 'submit'; to: string; reason: string }
  | { type: 'failed'; message: string }
  | { type: 'succeeded' };

export type Tone = 'approve' | 'caution' | 'neutral';

export const IDLE: ActionState = { step: 'choosing' };

export function moveTone({ by, reasonRequired }: Move): Tone {
  if (reasonRequired) return 'caution';
  return by === 'agent' ? 'neutral' : 'approve';
}

// Why a move cannot be made yet: it enters a state that waits for every child
// (requires: children_closed), closing or not, while some are open. The server refuses it too, and
// alone answers for blockers_closed, whose blockers the list does not carry.
export function moveBlock(move: Move, children: ChildrenSummary | undefined): string | undefined {
  const open = children?.open ?? 0;
  if (!move.requires?.includes('children_closed') || open === 0) return undefined;
  return t('move.waits', { count: open });
}

// One primary per screen: the first move that hands the turn on. Throwing work away is never the
// primary, nor is a move still waiting for children: the next eligible one takes it.
export function moveVariants(
  moves: readonly Move[],
  children?: ChildrenSummary | undefined,
): ButtonVariant[] {
  let primaryTaken = false;
  return moves.map((move) => {
    if (move.closes === 'discarded') return 'quiet';
    if (moveBlock(move, children) !== undefined) return 'default';
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

// What a move does, as the line under the moves says it: whose turn it becomes (and whether the
// item leaves or joins Waiting for you), or that it closes the item; and that it asks a reason.
export function moveSays(move: Move, item: { turn: Turn; agent?: string | undefined }): string {
  const parts: string[] = [];
  if (move.closes || move.turn === 'none') {
    parts.push(move.closes ? t('move.closesAs', { as: move.closes }) : t('move.closes'));
  } else if (move.turn === 'agent') {
    parts.push(item.agent ? t('turn.agent', { agent: item.agent }) : t('turn.anAgent'));
    if (item.turn === 'human') parts.push(t('move.leaves'));
  } else {
    parts.push(t('turn.yours'));
    if (item.turn !== 'human') parts.push(t('move.comes'));
  }
  if (move.reasonRequired) parts.push(t('move.asksReason'));
  return parts.join(' · ');
}

export function reduceAction(state: ActionState, event: ActionEvent): ActionState {
  switch (event.type) {
    case 'explain':
      return { step: 'explaining', to: event.to, reason: '' };
    case 'type':
      return state.step === 'explaining' ? { ...state, reason: event.reason } : state;
    case 'cancel':
      return IDLE;
    case 'submit':
      return { step: 'posting', to: event.to, reason: event.reason };
    case 'failed':
      if (state.step !== 'posting') return state;
      if (state.reason === '') return { step: 'choosing', error: event.message };
      return { step: 'explaining', to: state.to, reason: state.reason, error: event.message };
    case 'succeeded':
      return IDLE;
  }
}

export function canConfirm(state: ActionState): boolean {
  return state.step === 'explaining' && state.reason.trim() !== '';
}

export function isBusy(state: ActionState): boolean {
  return state.step === 'posting';
}
