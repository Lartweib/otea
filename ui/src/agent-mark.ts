import { relayOf } from './format.ts';
import type { ItemEvent } from './types.ts';

// An agent's mark: its initials on a chip tinted with one of a few quiet hues, the same hue for the
// same name everywhere (the list's who, the handoff line, History, Details).
export const AGENT_HUES = 5;

// claude-b is cb; a name of one word gives its first two letters.
export function initialsOf(name: string): string {
  const words = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const [first = ''] = words;
  return words.length > 1
    ? words
        .map((word) => word.charAt(0))
        .join('')
        .slice(0, 2)
    : first.slice(0, 2);
}

// A stable hash of the name (FNV-1a), folded onto the hues.
export function agentHue(name: string): number {
  let hash = 0x811c9dc5;
  for (const char of name) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % AGENT_HUES;
}

// The agent an event names: the one that acted, or the one that relayed your words; never you.
export function eventAgent(event: ItemEvent): string | null {
  const relay = relayOf(event);
  if (relay) return relay.via;
  return event.actor.kind === 'agent' ? event.actor.name : null;
}
