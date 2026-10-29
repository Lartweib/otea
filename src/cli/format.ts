import type { Item, ItemView } from '../app/items.ts';
import type { ValidationReport } from '../app/validate.ts';
import type { Actor } from '../core/item.ts';
import type { Lease } from '../core/lease.ts';

type Event = ItemView['events'][number];

export function columns(rows: readonly (readonly string[])[]): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, index) => cell.padEnd(widths[index] ?? 0))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

export function indent(text: string): string {
  return text.replace(/^/gm, '  ');
}

function actorLabel(actor: Actor): string {
  return `${actor.kind}:${actor.name}`;
}

function clockTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function leaseLabel({ holder, expiresAt }: Lease): string {
  return `held by ${holder} until ${clockTime(expiresAt)}`;
}

function itemRow(item: Item): string[] {
  return [item.id, item.state, item.turn, item.title, item.lease ? leaseLabel(item.lease) : ''];
}

export function formatItem(item: Item): string {
  return columns([itemRow(item)]);
}

export function formatItems(items: readonly Item[]): string {
  return items.length === 0 ? 'No items.' : columns(items.map(itemRow));
}

function fieldLines(fields: Record<string, unknown>): string[] {
  const lines = Object.entries(fields).map(([name, value]) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.includes('\n') ? `${name}:\n${indent(text)}` : `${name}: ${text}`;
  });
  return lines.length > 0 ? ['', ...lines] : [];
}

function quote(value: unknown): string {
  if (typeof value !== 'string') return '(none)';
  const text = JSON.stringify(value);
  return text.length > 42 ? `${text.slice(0, 40)}…"` : text;
}

function describeChanges(changes: unknown): string {
  const entries = Object.entries(
    (changes ?? {}) as Record<string, { from?: unknown; to?: unknown }>,
  );
  return entries
    .map(([name, { from, to }]) => `${name}: ${quote(from)} -> ${quote(to)}`)
    .join('; ');
}

// A decision relayed from conversation names the agent that relayed it and what the human said.
function relayNote({ via, quote }: Event['data']): string {
  if (typeof via !== 'string') return '';
  const said = typeof quote === 'string' ? `: ${JSON.stringify(quote)}` : '';
  return `, relayed by ${via}${said}`;
}

function describeEvent(event: Event): string {
  return `${describeAction(event)}${relayNote(event.data)}`;
}

function describeAction({ type, data }: Event): string {
  if (type === 'created') return String(data.state);
  if (type === 'transitioned') {
    const reason = data.reason === undefined ? '' : ` (${String(data.reason)})`;
    return `${String(data.from)} -> ${String(data.to)}${reason}`;
  }
  if (type === 'updated') return describeChanges(data.changes);
  if (type === 'claimed') {
    const previous =
      data.previous === undefined ? '' : `, taken over from ${String(data.previous)}`;
    return `${String(data.holder)} until ${String(data.expiresAt)}${previous}`;
  }
  if (type === 'released') {
    return `${String(data.holder)} (${data.cause === 'handoff' ? 'handed off' : 'released'})`;
  }
  return JSON.stringify(data);
}

function eventRow(event: Event): string[] {
  return [event.at, actorLabel(event.actor), event.type, describeEvent(event)];
}

export function formatEvent(event: Event): string {
  return [String(event.id), event.itemId, ...eventRow(event)].join('  ');
}

function movesLine(label: string, moves: ItemView['transitions']): string {
  const targets = moves.map(({ to, reasonRequired }) =>
    reasonRequired ? `${to} (reason required)` : to,
  );
  return `Agent can ${label} to: ${targets.length > 0 ? targets.join(', ') : 'nothing'}`;
}

function createdLine({ createdBy, createdAt, events }: ItemView): string {
  const channel = events.find(({ type }) => type === 'created')?.data.channel;
  const via = typeof channel === 'string' ? ` via ${channel}` : '';
  return `created by ${actorLabel(createdBy)}${via} at ${createdAt}`;
}

export function formatItemWithEvents(item: ItemView): string {
  return [
    `${item.id}  ${item.title}`,
    `state: ${item.state}  turn: ${item.turn}  collection: ${item.collection}`,
    ...(item.lease ? [leaseLabel(item.lease)] : []),
    createdLine(item),
    ...fieldLines(item.fields),
    '',
    ...(item.missing.length > 0 && item.turn !== 'none'
      ? [`Missing to complete: ${item.missing.join(', ')}`]
      : []),
    movesLine('move', item.transitions),
    movesLine('relay', item.relayable),
    '',
    'Events:',
    indent(columns(item.events.map(eventRow))),
  ].join('\n');
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function formatReport({ errors, warnings, findings }: ValidationReport): string {
  if (findings.length === 0) return 'No problems found.';
  const rows = findings.map(({ severity, subject, message }) => [severity, subject, message]);
  return `${columns(rows)}\n${plural(errors, 'error')}, ${plural(warnings, 'warning')}`;
}
