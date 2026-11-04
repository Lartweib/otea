import { LAYOUT_SLOTS, MODULE_REGISTRY } from '../../../src/core/modules.ts';
import type { LayoutSlot } from '../types.ts';

// The preview's parts, read off the real views: every part a layout places carries data-type,
// data-slot, data-index and, for a field, data-field (item-types.ts). Studio outlines, selects and
// edits what those name; it never draws a preview of its own.

export type Part = { type: string; slot: LayoutSlot; index: number; field?: string };

export function partFrom(get: (name: string) => string | null): Part | undefined {
  const type = get('data-type');
  const slot = get('data-slot');
  const index = Number(get('data-index'));
  if (type === null || slot === null || !Number.isInteger(index)) return undefined;
  if (!(LAYOUT_SLOTS as readonly string[]).includes(slot)) return undefined;
  const field = get('data-field');
  return { type, slot: slot as LayoutSlot, index, ...(field === null ? {} : { field }) };
}

export function partLabel(part: Part, module?: string): string {
  return `${part.field ?? module ?? part.slot} · ${part.slot}`;
}

export const samePart = (a: Part | undefined, b: Part | undefined) =>
  a !== undefined &&
  b !== undefined &&
  a.type === b.type &&
  a.slot === b.slot &&
  a.index === b.index;

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

// One box for each part, around every element that carries it (a field's label and its value).
export function merged(placed: readonly Placed[]): Placed[] {
  const parts: Placed[] = [];
  for (const { part, rect } of placed) {
    const known = parts.find((each) => samePart(each.part, part));
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

const takesFields = (slot: LayoutSlot) => MODULE_REGISTRY.text.slots.includes(slot);

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
    const sorted = [...parts].sort((a, b) => a.part.index - b.part.index);
    return sorted.map(({ part, rect }, at) => {
      const next = sorted[at + 1];
      const bottom = rect.top + rect.height;
      return {
        slot,
        index: part.index + 1,
        top: next ? Math.round((bottom + next.rect.top) / 2) : bottom,
      };
    });
  });
}
