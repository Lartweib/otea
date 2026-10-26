import type { Item, ItemWithEvents } from '../app/items.ts';
import type { Actor } from '../core/item.ts';

type Event = ItemWithEvents['events'][number];

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

function describeEvent({ type, data }: Event): string {
  if (type === 'created') return String(data.state);
  if (type === 'transitioned') {
    const reason = data.reason === undefined ? '' : ` (${String(data.reason)})`;
    return `${String(data.from)} -> ${String(data.to)}${reason}`;
  }
  return JSON.stringify(data);
}

function eventRow(event: Event): string[] {
  return [event.at, actorLabel(event.actor), event.type, describeEvent(event)];
}

export function formatItemWithEvents(item: ItemWithEvents): string {
  return [
    `${item.id}  ${item.title}`,
    `state: ${item.state}  turn: ${item.turn}  collection: ${item.collection}`,
    `created by ${actorLabel(item.createdBy)} at ${item.createdAt}`,
    ...(item.body ? ['', item.body] : []),
    '',
    'Events:',
    indent(columns(item.events.map(eventRow))),
  ].join('\n');
}
