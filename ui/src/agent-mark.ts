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

// A mark: the initials and hue an agent shows. In a project every agent gets one of its own: two
// whose initials meet (claude-a, cli-a) take another pair of letters from the name, and the hues
// spread over the agents while hues are left (a sixth agent shares one, never its initials too).
export type Mark = { initials: string; hue: number };

function letterPairs(name: string): string[] {
  const letters = [...name.toLowerCase()].filter((c) => /[\p{L}\p{N}]/u.test(c));
  const [first = ''] = letters;
  return letters.slice(1).map((c) => first + c);
}

export function marksFor(names: readonly string[]): Map<string, Mark> {
  const sorted = [...new Set(names)].sort();
  const marks = new Map<string, Mark>();
  const usedInitials = new Set<string>();
  const usedHues = new Set<number>();
  for (const name of sorted) {
    const own = initialsOf(name);
    const initials =
      [own, ...letterPairs(name)].find((pair) => pair && !usedInitials.has(pair)) ??
      `${own.charAt(0)}${sorted.indexOf(name) + 1}`;
    usedInitials.add(initials);
    const base = agentHue(name);
    const free = Array.from({ length: AGENT_HUES }, (_, i) => (base + i) % AGENT_HUES).find(
      (hue) => !usedHues.has(hue),
    );
    const hue = free ?? base;
    usedHues.add(hue);
    marks.set(name, { initials, hue });
  }
  return marks;
}

// The project's agents, as the agents list last named them: each mark is read from them.
let known = new Map<string, Mark>();

export function knowAgents(names: readonly string[]): void {
  known = marksFor(names);
}

export function markOf(name: string): Mark {
  return known.get(name) ?? { initials: initialsOf(name), hue: agentHue(name) };
}

// The agent an event names: the one that acted, or the one that relayed your words; never you.
export function eventAgent(event: ItemEvent): string | null {
  const relay = relayOf(event);
  if (relay) return relay.via;
  return event.actor.kind === 'agent' ? event.actor.name : null;
}
