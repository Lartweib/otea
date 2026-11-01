import type { Item, ItemView } from '../app/items.ts';
import type { ValidationReport } from '../app/validate.ts';
import { clockTime } from '../core/hint.ts';
import type { Actor } from '../core/item.ts';
import type { Lease } from '../core/lease.ts';
import type { Layout } from '../core/modules.ts';
import { type EvidenceModuleEntry, groupEvidence } from '../core/placement.ts';
import { DEFAULT_TYPE } from '../core/preset.ts';
import { describeRelation, type Relation, type RelationView } from '../core/relations.ts';
import type { EvidenceRecord } from '../store/queries.ts';

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

function leaseLabel({ holder, expiresAt }: Lease): string {
  return `held by ${holder} until ${clockTime(expiresAt)}`;
}

// Items of a preset without types are all of the implicit type, so the text leaves it out.
function typed(item: Item): boolean {
  return item.type !== DEFAULT_TYPE;
}

function itemRow(item: Item, withType: boolean): string[] {
  const lease = item.lease ? leaseLabel(item.lease) : '';
  const type = withType ? [item.type] : [];
  return [item.id, ...type, item.state, item.turn, item.title, lease];
}

export function formatItem(item: Item): string {
  return columns([itemRow(item, typed(item))]);
}

export function formatItems(items: readonly Item[]): string {
  if (items.length === 0) return 'No items.';
  const withType = items.some(typed);
  return columns(items.map((item) => itemRow(item, withType)));
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
  if (type === 'relation_added' || type === 'relation_removed') {
    return describeRelation(data as Relation);
  }
  if (type === 'evidence_added') {
    const caption = typeof data.caption === 'string' ? ` (${JSON.stringify(data.caption)})` : '';
    const { evidenceId, role, kind, filename } = data;
    const into = typeof data.module === 'string' ? ` in ${data.module}` : '';
    return `#${String(evidenceId)} ${String(role)} ${String(kind)} ${String(filename)}${into}${caption}`;
  }
  return JSON.stringify(data);
}

function eventRow(event: Event): string[] {
  return [event.at, actorLabel(event.actor), event.type, describeEvent(event)];
}

export function formatEvent(event: Event): string {
  return [String(event.id), event.itemId, ...eventRow(event)].join('  ');
}

function byteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function evidenceRow({ id, role, kind, filename, size, caption }: EvidenceRecord): string[] {
  return [`#${id}`, role, kind, filename, byteSize(size), caption ?? ''];
}

// An attached entry, led by the module it went to.
export function formatEvidence(evidence: EvidenceRecord): string {
  const [id = '', ...rest] = evidenceRow(evidence);
  return columns([evidence.module === null ? [id, ...rest] : [id, evidence.module, ...rest]]);
}

function moduleHeading({ id, module, variant, required, label }: EvidenceModuleEntry): string {
  const traits = [module, ...(variant ? [variant] : []), ...(required ? ['required'] : [])];
  return `${id} (${traits.join(', ')})${label ? `: ${label}` : ''}`;
}

function evidenceLines(evidence: EvidenceRecord[], layout: Layout | undefined): string[] {
  const rows = (entries: EvidenceRecord[]) => columns(entries.map(evidenceRow));
  const groups = layout ? groupEvidence(layout, evidence) : { modules: [], others: evidence };
  if (groups.modules.length === 0) {
    return evidence.length > 0 ? ['Evidence:', indent(rows(evidence)), ''] : [];
  }
  const sections = groups.modules.map(({ module, evidence: held }) =>
    [moduleHeading(module), indent(held.length > 0 ? rows(held) : 'nothing yet')].join('\n'),
  );
  if (groups.others.length > 0) {
    sections.push(['other files', indent(rows(groups.others))].join('\n'));
  }
  return ['Evidence:', indent(sections.join('\n')), ''];
}

const VIEW_HEADING: Readonly<Record<RelationView, string>> = {
  parent: 'parent',
  child: 'children',
  blocks: 'blocks',
  blocked_by: 'blocked by',
  duplicates: 'duplicates',
  duplicated_by: 'duplicated by',
  implements: 'implements',
  implemented_by: 'implemented by',
  relates: 'related',
};

// The children summary of a parent, then its relations grouped by kind, each other item as a row.
function relationLines({ relations, children }: ItemView): string[] {
  const lines: string[] = [];
  if (children) {
    const closed = children.total - children.open;
    lines.push(
      `Children: ${closed} of ${children.total} closed (${children.done} done, ${children.discarded} discarded)`,
    );
  }
  if (relations.length > 0) {
    const groups = new Map<RelationView, string[][]>();
    for (const { kind, id, state, turn, title } of relations) {
      groups.set(kind, [...(groups.get(kind) ?? []), [id, state, turn, title]]);
    }
    const sections = [...groups].map(
      ([kind, rows]) => `${VIEW_HEADING[kind]}\n${indent(columns(rows))}`,
    );
    lines.push('Relations:', indent(sections.join('\n')));
  }
  return lines.length > 0 ? [...lines, ''] : [];
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

// With the item type's layout, evidence is grouped by the module that draws it.
export function formatItemWithEvents(item: ItemView & { hint?: string }, layout?: Layout): string {
  return [
    `${item.id}  ${item.title}`,
    `state: ${item.state}  turn: ${item.turn}  ${typed(item) ? `type: ${item.type}  ` : ''}collection: ${item.collection}`,
    ...(item.lease ? [leaseLabel(item.lease)] : []),
    createdLine(item),
    ...(item.hint ? [`Next: ${item.hint}`] : []),
    ...fieldLines(item.fields),
    '',
    ...(item.missing.length > 0 && item.turn !== 'none'
      ? [`Missing to complete: ${item.missing.join(', ')}`]
      : []),
    movesLine('move', item.transitions),
    movesLine('relay', item.relayable),
    '',
    ...relationLines(item),
    ...evidenceLines(item.evidence, layout),
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
