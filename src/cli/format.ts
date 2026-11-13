import type { Item, ItemView } from '../app/items.ts';
import type { ValidationReport } from '../app/validate.ts';
import type { Actor } from '../core/item.ts';
import type { Lease } from '../core/lease.ts';
import type { Layout } from '../core/modules.ts';
import { type EvidenceModuleEntry, groupEvidence } from '../core/placement.ts';
import { DEFAULT_TYPE } from '../core/preset.ts';
import { describeRelation, type Relation, type RelationView } from '../core/relations.ts';
import { timeText } from '../core/time.ts';
import type { EvidenceRecord } from '../store/queries.ts';
import type { GitHookStatus } from './hooks.ts';

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
  return `held by ${holder} until ${timeText(expiresAt)}`;
}

// Whether the text names an item's type. Commands know whether its preset has several types; left
// to itself, the text leaves out only the implicit type, which every item of a preset without types
// has.
export type Typed = (item: Item) => boolean;

const notImplicit: Typed = (item) => item.type !== DEFAULT_TYPE;

function itemRow(item: Item, withType: boolean): string[] {
  const lease = item.lease ? leaseLabel(item.lease) : '';
  const type = withType ? [item.type] : [];
  return [item.id, ...type, item.state, item.turn, item.title, lease];
}

export function formatItem(item: Item, typed: Typed = notImplicit): string {
  return columns([itemRow(item, typed(item))]);
}

export function formatItems(items: readonly Item[], typed: Typed = notImplicit): string {
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

// Why a lease ended: its holder let it go, a move handed it off, or the person put a stuck item
// back in the queue of its step or left it for another agent (from Atasco, in the UI).
function releaseCause(data: Event['data']): string {
  if (data.cause === 'handoff') return 'handed off';
  if (data.cause === 'restart') return 'back in the queue';
  if (data.cause === 'reassign') return `left for ${String(data.next)}`;
  return 'released';
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
    return `${String(data.holder)} until ${timeText(String(data.expiresAt))}${previous}`;
  }
  if (type === 'released') return `${String(data.holder)} (${releaseCause(data)})`;
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
  return [timeText(event.at), actorLabel(event.actor), event.type, describeEvent(event)];
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

// `named`: on a board, evidence goes by its name; its hidden id is not a reader's word.
function moduleHeading(
  { id, module, variant, required, label }: EvidenceModuleEntry,
  named: boolean,
): string {
  const traits = [module, ...(variant ? [variant] : []), ...(required ? ['required'] : [])];
  if (named && label) return `${label} (${traits.join(', ')})`;
  return `${id} (${traits.join(', ')})${label ? `: ${label}` : ''}`;
}

function evidenceLines(
  evidence: EvidenceRecord[],
  layout: Layout | undefined,
  named = false,
): string[] {
  const rows = (entries: EvidenceRecord[]) => columns(entries.map(evidenceRow));
  const groups = layout ? groupEvidence(layout, evidence) : { modules: [], others: evidence };
  if (groups.modules.length === 0) {
    return evidence.length > 0 ? ['Evidence:', indent(rows(evidence)), ''] : [];
  }
  const sections = groups.modules.map(({ module, evidence: held }) =>
    [moduleHeading(module, named), indent(held.length > 0 ? rows(held) : 'nothing yet')].join('\n'),
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

function gatesLine(gates: Record<string, boolean>): string {
  const verdicts = Object.entries(gates).map(
    ([action, allowed]) => `${action} ${allowed ? 'allowed' : 'blocked'}`,
  );
  return `Gates: ${verdicts.join(', ')}`;
}

// Whether the checkouts of the item's repo have Otea's pre-push hook (show, on a repo task).
export function gitHookLine({ repo, installed, missing }: GitHookStatus): string {
  if (installed.length === 0 && missing.length === 0)
    return `Git hook: no checkout of ${repo} is known to the project (otea repos add)`;
  const said = [
    ...(installed.length > 0 ? [`installed in ${installed.join(', ')}`] : []),
    ...(missing.length > 0
      ? [`not installed in ${missing.join(', ')}: run otea hook install --git there`]
      : []),
  ];
  return `Git hook: ${said.join('; ')}`;
}

function createdLine({ createdBy, createdAt, events }: ItemView): string {
  const channel = events.find(({ type }) => type === 'created')?.data.channel;
  const via = typeof channel === 'string' ? ` via ${channel}` : '';
  return `created by ${actorLabel(createdBy)}${via} at ${timeText(createdAt)}`;
}

// With the item type's layout, evidence is grouped by the module that draws it.
// `named`: the item is on a board and reads by names (states, fields and moves already are).
export function formatItemWithEvents(
  item: ItemView & { hint?: string; gitHook?: GitHookStatus },
  layout?: Layout,
  typed: Typed = notImplicit,
  named = false,
): string {
  return [
    `${item.id}  ${item.title}`,
    `state: ${item.state}  turn: ${item.turn}  ${typed(item) ? `type: ${item.type}  ` : ''}collection: ${item.collection}`,
    ...(item.lease ? [leaseLabel(item.lease)] : []),
    createdLine(item),
    // On a board the hint is next's whole answer, indented under its heading.
    ...(item.hint
      ? [
          item.hint.includes('\n')
            ? `Next:\n${indent(item.hint).replace(/^ +$/gm, '')}`
            : `Next: ${item.hint}`,
        ]
      : []),
    ...fieldLines(item.fields),
    '',
    ...(item.missing.length > 0 && item.turn !== 'none'
      ? [`Missing to complete: ${item.missing.join(', ')}`]
      : []),
    // On a board, Next: says how to finish the step; what is left to relay still shows.
    ...(named ? [] : [movesLine('move', item.transitions)]),
    ...(named && item.relayable.length === 0 ? [] : [movesLine('relay', item.relayable)]),
    ...(item.gates ? [gatesLine(item.gates)] : []),
    ...(item.gitHook ? [gitHookLine(item.gitHook)] : []),
    '',
    ...relationLines(item),
    ...evidenceLines(item.evidence, layout, named),
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
