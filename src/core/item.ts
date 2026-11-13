import { OteaError } from './errors.ts';

export type Actor = { kind: 'human' | 'agent'; name: string };

// An agent's name is its identity, one per agent working at the same time: a short slug, lowercase
// letters and digits joined by single dashes, starting with a letter. The web UI says "you" for the
// human, so neither word names an agent, and "agent" names no one in particular.
const AGENT_NAME = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){0,23}$/;
const RESERVED_AGENT_NAMES = ['you', 'human', 'agent'];

export function assertAgentName(name: string): void {
  if (AGENT_NAME.test(name) && !RESERVED_AGENT_NAMES.includes(name)) return;
  throw new OteaError(
    'invalid_agent_name',
    `"${name}" cannot name an agent: use at most 24 lowercase letters, digits and single dashes, starting with a letter (not "you", "human" or "agent"), such as claude-b`,
    { kind: 'agent_name', name },
  );
}

// The agent acting under the name it gave, checked by the one rule every surface uses. `how` says
// how to give a name on that surface, for an agent that gave none: there is no default name.
export function agentActor(name: string | undefined, how: string): Actor {
  if (name === undefined || name === '') {
    throw new OteaError(
      'unnamed_agent',
      `Name yourself first: ${how}. Pick a short name no other agent working now uses, such as claude-b; subagents each use their own.`,
    );
  }
  assertAgentName(name);
  return { kind: 'agent', name };
}

export type ItemId = { prefix: string; seq: number };

const ID_PATTERN = /^([A-Z0-9]+)-([1-9][0-9]*)$/;

export function prefixFor(collectionName: string): string {
  const prefix = collectionName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!prefix) throw new OteaError('invalid_name', `"${collectionName}" has no usable characters`);
  return prefix;
}

export function formatItemId(prefix: string, seq: number): string {
  return `${prefix}-${seq}`;
}

export function parseItemId(id: string): ItemId {
  const match = ID_PATTERN.exec(id);
  if (!match?.[1] || !match[2]) throw new OteaError('invalid_id', `"${id}" is not an item id`);
  return { prefix: match[1], seq: Number(match[2]) };
}
