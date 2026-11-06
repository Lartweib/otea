import { LAYOUT_SLOTS, MODULE_REGISTRY } from '../../../src/core/modules.ts';
import type { LayoutEntry, LayoutSlot } from '../types.ts';

// The preview's parts, read off the real views: every part a layout places carries data-type,
// data-slot, data-index and, for a field, data-field (item-types.ts). Studio outlines, selects and
// edits what those name; it never draws a preview of its own.

export type Part = { type: string; slot: LayoutSlot; index: number; field?: string; section?: number };

export function partFrom(get: (name: string) => string | null): Part | undefined {
  const type = get('data-type');
  const slot = get('data-slot');
  const index = Number(get('data-index'));
  if (type === null || slot === null || !Number.isInteger(index)) return undefined;
  if (!(LAYOUT_SLOTS as readonly string[]).includes(slot)) return undefined;
  const field = get('data-field');
  const at = get('data-section');
  const section = at === null ? NaN : Number(at);
  return {
    type,
    slot: slot as LayoutSlot,
    index,
    ...(field === null ? {} : { field }),
    ...(Number.isInteger(section) && section >= 0 ? { section } : {}),
  };
}

// The entry a part names. A section's entries are not the body slot's: index counts within the section.
export function entryOfPart(
  layout: { sections?: readonly { entries: readonly LayoutEntry[] }[] } & Record<
    LayoutSlot,
    readonly LayoutEntry[]
  >,
  part: Part,
): LayoutEntry | undefined {
  if (part.index < 0) return undefined;
  return part.section === undefined
    ? layout[part.slot][part.index]
    : layout.sections?.[part.section]?.entries[part.index];
}

export function partLabel(part: Part, module?: string): string {
  return `${part.field ?? module ?? part.slot} · ${part.slot}`;
}

export const samePart = (a: Part | undefined, b: Part | undefined) =>
  a !== undefined &&
  b !== undefined &&
  a.type === b.type &&
  a.slot === b.slot &&
  a.index === b.index &&
  a.section === b.section;

export type Box = { top: number; left: number; height: number; width: number };
export type Placed = { part: Part; rect: Box };

function grow(box: Box, rect: Box): void {
  const bottom = Math.max(box.top + box.height, rect.top + rect.height);
  const right = Math.max(box.left + box.width, rect.left + rect.width);
  box.top = Math.min(box.top, rect.top);
  box.left = Math.min(box.left, rect.left);
  box.height = bottom - box.top;
  box.width = right - box.left;
}

const meets = (a: Box, b: Box) => a.top <= b.top + b.height + 4 && b.top <= a.top + a.height + 4;

// One box for each part, around every element that carries it (a field's label and its value).
// The same part drawn again further down (in every row of a list) keeps a box of its own.
export function merged(placed: readonly Placed[]): Placed[] {
  const parts: Placed[] = [];
  for (const { part, rect } of placed) {
    const known = parts.find((each) => samePart(each.part, part) && meets(each.rect, rect));
    if (known) grow(known.rect, rect);
    else parts.push({ part, rect: { ...rect } });
  }
  return parts;
}

// One box around every part of each slot, in the order the slots first appear.
export function slotBoxes(placed: readonly Placed[]): Array<{ slot: LayoutSlot; rect: Box }> {
  const boxes = new Map<LayoutSlot, Box>();
  for (const { part, rect } of placed) {
    const box = boxes.get(part.slot);
    if (box) grow(box, rect);
    else boxes.set(part.slot, { ...rect });
  }
  return [...boxes].map(([slot, rect]) => ({ slot, rect }));
}

// The slots that stack their parts and take fields: + field here goes between them. The header and
// the row line their parts up, and are added to from the inspector.
const STACKED: readonly LayoutSlot[] = ['body', 'side', 'intake', 'phone'];
const takesFields = (slot: LayoutSlot) =>
  STACKED.includes(slot) && MODULE_REGISTRY.text.slots.includes(slot);

// Where + field here sits: after each part of a slot that takes fields, half way to the next one,
// with the index a new field would take there.
export function gapsOf(
  placed: readonly Placed[],
): Array<{ slot: LayoutSlot; index: number; top: number }> {
  const bySlot = new Map<LayoutSlot, Placed[]>();
  for (const each of placed) {
    if (!takesFields(each.part.slot)) continue;
    bySlot.set(each.part.slot, [...(bySlot.get(each.part.slot) ?? []), each]);
  }
  return [...bySlot].flatMap(([slot, parts]) => {
    // Down the page: a part the view draws elsewhere (a module in its own section) keeps its index.
    const sorted = [...parts].sort((a, b) => a.rect.top - b.rect.top);
    return sorted.map(({ part, rect }, at) => {
      const next = sorted[at + 1];
      const bottom = rect.top + rect.height;
      return {
        slot,
        index: part.index + 1,
        top: next && next.rect.top >= bottom ? Math.round((bottom + next.rect.top) / 2) : bottom,
      };
    });
  });
}
