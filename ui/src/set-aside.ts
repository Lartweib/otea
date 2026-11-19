import type { ItemEvent } from './types.ts';

// An item an agent set aside for later, in its events as the server writes them (P7-R3-1; the
// server's own module, src/app/set-aside.ts, reads the store, so the UI names them here): the
// agent's release with cause `later`, and the event that lifts it, saying why.
export const SET_ASIDE_LIFTED = 'set_aside_lifted';

export function isSetAside({ type, actor, data }: Pick<ItemEvent, 'type' | 'actor' | 'data'>) {
  return type === 'released' && actor.kind === 'agent' && data.cause === 'later';
}
