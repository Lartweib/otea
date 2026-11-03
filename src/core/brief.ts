import { orderByBlocks, type Relation } from './relations.ts';

// What a brief says of one item: its fields as they are stored (the description leads, as text).
export type BriefItem = {
  id: string;
  title: string;
  collection: string;
  state: string;
  fields: Readonly<Record<string, unknown>>;
};

// An item that blocks one in the brief: still open or not.
export type Blocker = { id: string; open: boolean };

export type BriefInput = {
  project: string;
  // The items in the order the person put them; the brief keeps it wherever blocks allow.
  items: readonly BriefItem[];
  relations: readonly Relation[];
  // Whether an item outside the brief is still open; an unknown one counts as open.
  isOpen: (id: string) => boolean;
  limits: readonly string[];
  success: readonly string[];
  writtenAt: string;
};

// Where one item sits: the items of the brief it comes after, and the open blockers left out of it
// (the agent should stop and ask before starting it).
export type BriefEntry = { id: string; title: string; after: string[]; missing: string[] };

export type Brief = { order: BriefEntry[]; markdown: string };

export const DEFAULT_LIMITS: readonly string[] = [
  'Touch only what these items need.',
  'No new dependencies; ask first if a fix needs one.',
];

export const DEFAULT_SUCCESS: readonly string[] = [
  'Every item reaches review with its evidence attached.',
  'Existing tests pass; new behavior gets a test where it can.',
  'You never mark an item done; the person approves it.',
];

// The lines a person typed into a list: one per line, trimmed, the blank ones dropped.
export function briefLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const fieldText = (value: unknown) =>
  typeof value === 'string'
    ? value.trim()
    : value === null || value === undefined
      ? ''
      : String(value);

// A value under a list entry: its first line after the label, the rest indented beneath it.
const indented = (text: string) => text.split('\n').join('\n  ');

function itemSection(item: BriefItem, entry: BriefEntry): string[] {
  const lines = [`### ${item.id} · ${item.title}`, ''];
  const description = fieldText(item.fields.description);
  if (description) lines.push(description, '');
  lines.push(`- board: ${item.collection} · ${item.state}`);
  for (const [name, value] of Object.entries(item.fields)) {
    const text = fieldText(value);
    if (name === 'title' || name === 'description' || text === '') continue;
    lines.push(`- ${name}: ${indented(text)}`);
  }
  if (entry.after.length > 0) lines.push(`- after: ${entry.after.join(', ')}`);
  if (entry.missing.length > 0) {
    lines.push(`- blocked: ${entry.missing.join(', ')} is not in this brief; stop and ask.`);
  }
  return [...lines, ''];
}

const bullets = (lines: readonly string[]) => lines.map((line) => `- ${line}`);

// A Markdown brief for an agent: the items in the order their blocks allow, each with its fields,
// what it waits for and the open blockers left out, then the limits and what success means.
export function writeBrief(input: BriefInput): Brief {
  const byId = new Map(input.items.map((item) => [item.id, item]));
  const ids = orderByBlocks(
    input.items.map(({ id }) => id),
    input.relations,
  );
  const blocks = input.relations.filter(({ kind }) => kind === 'blocks');
  const order = ids.map((id): BriefEntry => {
    const blockers = blocks.filter(({ to }) => to === id).map(({ from }) => from);
    return {
      id,
      title: byId.get(id)?.title ?? id,
      after: blockers.filter((other) => byId.has(other)),
      missing: blockers.filter((other) => !byId.has(other) && input.isOpen(other)),
    };
  });
  const count = order.length === 1 ? '1 item' : `${order.length} items`;
  const markdown = [
    `# Brief · ${input.project}`,
    '',
    `${count} · written ${input.writtenAt}`,
    '',
    'Work these items in the order below. Claim each one before you start and heartbeat while you work. Hand each one back with its evidence attached. If something is unclear, stop and ask in the item instead of guessing.',
    '',
    '## Order',
    '',
    ...order.map(({ id, title, after, missing }, index) => {
      const note =
        missing.length > 0
          ? `needs ${missing.join(', ')}, not in this brief`
          : after.length > 0
            ? `after ${after.join(', ')}`
            : '';
      return `${index + 1}. ${id} · ${title}${note ? ` (${note})` : ''}`;
    }),
    '',
    '## Items',
    '',
    ...order.flatMap((entry) => {
      const item = byId.get(entry.id);
      return item ? itemSection(item, entry) : [];
    }),
    ...(input.limits.length > 0 ? ['## Limits', '', ...bullets(input.limits), ''] : []),
    ...(input.success.length > 0 ? ['## Success', '', ...bullets(input.success), ''] : []),
    '## Hand back',
    '',
    'Move each item on to review when it holds. Leave a note on anything you skipped.',
    '',
  ].join('\n');
  return { order, markdown };
}
