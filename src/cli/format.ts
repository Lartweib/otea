import type { Item, ItemView } from '../app/items.ts';
import type { ValidationReport } from '../app/validate.ts';
import type { Actor } from '../core/item.ts';

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

function itemRow(item: Item): string[] {
  return [item.id, item.state, item.turn, item.title];
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

function describeEvent({ type, data }: Event): string {
  if (type === 'created') return String(data.state);
  if (type === 'transitioned') {
    const reason = data.reason === undefined ? '' : ` (${String(data.reason)})`;
    return `${String(data.from)} -> ${String(data.to)}${reason}`;
  }
  if (type === 'updated') return describeChanges(data.changes);
  return JSON.stringify(data);
}

function eventRow(event: Event): string[] {
  return [event.at, actorLabel(event.actor), event.type, describeEvent(event)];
}

function movesLine({ transitions }: ItemView): string {
  const moves = transitions.map(({ to, reasonRequired }) =>
    reasonRequired ? `${to} (reason required)` : to,
  );
  return `Agent can move to: ${moves.length > 0 ? moves.join(', ') : 'nothing'}`;
}

export function formatItemWithEvents(item: ItemView): string {
  return [
    `${item.id}  ${item.title}`,
    `state: ${item.state}  turn: ${item.turn}  collection: ${item.collection}`,
    `created by ${actorLabel(item.createdBy)} at ${item.createdAt}`,
    ...fieldLines(item.fields),
    '',
    ...(item.missing.length > 0 && item.turn !== 'none'
      ? [`Missing to complete: ${item.missing.join(', ')}`]
      : []),
    movesLine(item),
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
