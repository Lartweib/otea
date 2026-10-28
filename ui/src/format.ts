import type { Actor, ItemEvent, Lease } from './types.ts';

export function actorLabel(actor: Actor): string {
  return `${actor.name} (${actor.kind})`;
}

export function eventActorLabel({ actor, data }: ItemEvent): string {
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
