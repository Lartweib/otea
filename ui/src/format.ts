import type { Actor, ItemEvent } from './types.ts';

export function actorLabel(actor: Actor): string {
  return `${actor.name} (${actor.kind})`;
}

export function describeEvent({ type, data }: ItemEvent): string {
  if (type === 'created') return `Created in ${String(data.state)}`;
  if (type === 'transitioned') return `Moved from ${String(data.from)} to ${String(data.to)}`;
  return type;
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
