import { language, t } from './i18n/i18n.ts';
import type { Actor, ItemEvent, Lease } from './types.ts';

const SAID = {
  parent: 'said.parent',
  relates: 'said.relates',
  blocks: 'said.blocks',
  duplicates: 'said.duplicates',
  implements: 'said.implements',
} as const;

// A stored relation as a sentence, the way the CLI says it.
export function relationSentence(kind: string, from: string, to: string): string {
  const key = SAID[kind as keyof typeof SAID];
  return key ? t(key, { from, to }) : `${from} ${kind} ${to}`;
}

export function actorLabel(actor: Actor): string {
  return `${actor.name} (${t(actor.kind === 'human' ? 'actor.human' : 'actor.agent')})`;
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
  if (relay) return t('event.relayedBy', { actor: actor.name, via: relay.via });
  return data.channel === 'ui' ? `${actor.name} (ui)` : actorLabel(actor);
}

// How a line names a field and its values: the preset's words for the language on screen, or the
// keys as stored when no type is at hand.
export type FieldWords = {
  field: (key: string) => string;
  value: (key: string, value: string) => string;
};

const AS_STORED: FieldWords = { field: (key) => key, value: (_key, value) => value };

export function describeEvent({ type, data }: ItemEvent, words: FieldWords = AS_STORED): string {
  if (type === 'created') return t('event.created', { state: String(data.state) });
  if (type === 'transitioned') {
    const moved = { from: String(data.from), to: String(data.to) };
    return data.reason === undefined
      ? t('event.moved', moved)
      : t('event.movedWhy', { ...moved, reason: String(data.reason) });
  }
  if (type === 'updated') return describeUpdate(data.changes, words);
  if (type === 'claimed') {
    const holder = String(data.holder);
    return data.previous === undefined
      ? t('event.claimed', { holder })
      : t('event.claimedOver', { holder, previous: String(data.previous) });
  }
  if (type === 'released') {
    const holder = String(data.holder);
    return data.cause === 'handoff'
      ? t('event.releasedOnHandoff', { holder })
      : t('event.released', { holder });
  }
  if (type === 'relation_added' || type === 'relation_removed') {
    const relation = relationSentence(String(data.kind), String(data.from), String(data.to));
    return t(type === 'relation_added' ? 'event.linked' : 'event.unlinked', { relation });
  }
  if (type === 'evidence_added') {
    const role = data.role === 'single' ? '' : ` (${String(data.role)})`;
    const caption = typeof data.caption === 'string' ? `: ${data.caption}` : '';
    return `${t('event.attached', { file: String(data.filename) })}${role}${caption}`;
  }
  if (type === 'note_left') return t('event.noteLeft');
  if (type === 'note_answered') return t('event.noteAnswered', { n: String(data.note) });
  return type;
}

type Changes = Record<string, { from: string | null; to: string | null }>;

function describeUpdate(changes: unknown, words: FieldWords): string {
  const entries = Object.entries((changes ?? {}) as Changes);
  const shorten = (text: string) => (text.length > 40 ? `${text.slice(0, 40)}…` : text);
  const parts = entries.map(([field, { from }]) =>
    t('event.was', {
      field: words.field(field),
      value: shorten(from === null ? t('event.empty') : words.value(field, from)),
    }),
  );
  return t('event.updated', { changes: parts.join(', ') });
}

export function leaseLabel({ holder, expiresAt }: Lease, timeZone?: string): string {
  return t('lease.heldUntil', { holder, time: formatTime(expiresAt, timeZone).slice(-5) });
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

export type Age = { unit: 'now' | 'm' | 'h' | 'yesterday' | 'd'; count: number };

// How long ago, in the largest whole unit; undefined for a date it cannot read.
export function ageOf(iso: string, now: number): Age | undefined {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (Number.isNaN(minutes)) return undefined;
  if (minutes < 1) return { unit: 'now', count: 0 };
  if (minutes < 60) return { unit: 'm', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'h', count: hours };
  return hours < 48
    ? { unit: 'yesterday', count: 1 }
    : { unit: 'd', count: Math.floor(hours / 24) };
}

// A span of time in its unit, as a list row or a lease says it: 12m, 3h, 5d.
export function spanLabel(unit: 'm' | 'h' | 'd', count: number): string {
  if (unit === 'm') return t('time.minutes', { count });
  return t(unit === 'h' ? 'time.hours' : 'time.days', { count });
}

// How long ago, as a list row says it: now, 12m, 3h, yesterday, 5d.
export function ageLabel(iso: string, now: number): string {
  const age = ageOf(iso, now);
  if (!age) return '';
  if (age.unit === 'now') return t('age.now');
  return age.unit === 'yesterday' ? t('age.yesterday') : spanLabel(age.unit, age.count);
}

// How long ago, as a sentence says it: just now, 14m ago, 3h ago, yesterday, 5d ago.
export function agoLabel(iso: string, now: number): string {
  const age = ageOf(iso, now);
  if (!age) return '';
  if (age.unit === 'now') return t('ago.now');
  if (age.unit === 'yesterday') return t('age.yesterday');
  return t('ago.time', { time: spanLabel(age.unit, age.count) });
}

// A moment split in two: its day when it is not today (28 Oct; 2 Jan 2025 from another year), its
// month named in the language on screen, and its time. History stacks the day over the time so its column stays narrow.
export function momentParts(
  iso: string,
  now: number,
  timeZone?: string,
): { day?: string; time: string } {
  const [date = '', time = ''] = formatTime(iso, timeZone).split(' ');
  const [today = ''] = formatTime(new Date(now).toISOString(), timeZone).split(' ');
  if (time === '') return { time: iso };
  if (date === today) return { time };
  const [year, month, day] = date.split('-');
  const name = new Intl.DateTimeFormat(language(), { month: 'short', timeZone: 'UTC' }).format(
    Date.UTC(Number(year), Number(month) - 1, 1),
  );
  const short = `${Number(day)} ${name}`;
  return { day: year === today.slice(0, 4) ? short : `${short} ${year}`, time };
}

// A moment as the detail says it: the time on the day it happened, the day and time otherwise
// (28 Oct, 12:31); with the year when it is not this one.
export function momentLabel(iso: string, now: number, timeZone?: string): string {
  const { day, time } = momentParts(iso, now, timeZone);
  return day ? `${day}, ${time}` : time;
}
