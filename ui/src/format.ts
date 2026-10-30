import type { Actor, ItemEvent, Lease } from './types.ts';

// A stored relation as a sentence, the way the CLI says it.
export function relationSentence(kind: string, from: string, to: string): string {
  if (kind === 'parent') return `${from} is a child of ${to}`;
  if (kind === 'relates') return `${from} relates to ${to}`;
  return `${from} ${kind} ${to}`;
}

export function actorLabel(actor: Actor): string {
  return `${actor.name} (${actor.kind})`;
}

export type Relay = { via: string; quote: string | null };

// A decision the human made in conversation and an agent relayed: it is the human's, but it never
// reads as one made in the UI.
export function relayOf({ data }: ItemEvent): Relay | null {
  if (typeof data.via !== 'string') return null;
  return { via: data.via, quote: typeof data.quote === 'string' ? data.quote : null };
}

export function eventActorLabel(event: ItemEvent): string {
  const { actor, data } = event;
  const relay = relayOf(event);
  if (relay) return `${actor.name}, relayed by ${relay.via}`;
  return data.channel === 'ui' ? `${actor.name} (ui)` : actorLabel(actor);
}

export function describeEvent({ type, data }: ItemEvent): string {
  if (type === 'created') return `Created in ${String(data.state)}`;
  if (type === 'transitioned') {
    const reason = data.reason === undefined ? '' : `: ${String(data.reason)}`;
    return `Moved from ${String(data.from)} to ${String(data.to)}${reason}`;
  }
  if (type === 'updated') return describeUpdate(data.changes);
  if (type === 'claimed') {
    const previous =
      data.previous === undefined ? '' : `, taking over from ${String(data.previous)}`;
    return `Claimed by ${String(data.holder)}${previous}`;
  }
  if (type === 'released') {
    return data.cause === 'handoff'
      ? `Lease of ${String(data.holder)} released on handoff`
      : `Released by ${String(data.holder)}`;
  }
  if (type === 'relation_added' || type === 'relation_removed') {
    const said = relationSentence(String(data.kind), String(data.from), String(data.to));
    return `${type === 'relation_added' ? 'Linked' : 'Unlinked'}: ${said}`;
  }
  if (type === 'evidence_added') {
    const role = data.role === 'single' ? '' : ` (${String(data.role)})`;
    const caption = typeof data.caption === 'string' ? `: ${data.caption}` : '';
    return `Attached ${String(data.filename)}${role}${caption}`;
  }
  return type;
}

type Changes = Record<string, { from: string | null; to: string | null }>;

function describeUpdate(changes: unknown): string {
  const entries = Object.entries((changes ?? {}) as Changes);
  const shorten = (text: string) => (text.length > 40 ? `${text.slice(0, 40)}…` : text);
  const parts = entries.map(([name, { from }]) => `${name} (was ${shorten(from ?? 'empty')})`);
  return `Updated ${parts.join(', ')}`;
}

export function leaseLabel({ holder, expiresAt }: Lease, timeZone?: string): string {
  return `held by ${holder} until ${formatTime(expiresAt, timeZone).slice(-5)}`;
}

export function formatTime(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}
