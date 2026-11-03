import type { BriefEntry } from '../../src/core/brief.ts';

// A brief as POST /api/brief writes it. Type-only from the core.
export type { BriefEntry } from '../../src/core/brief.ts';
export type WrittenBrief = {
  order: BriefEntry[];
  markdown: string;
  limits: string[];
  success: string[];
};

// Moving an item one place up or down the brief, as it reads now: the new order to ask for, or the
// item that has to stay before the other (what blocks an item never goes after it).
export type Reorder = { ids: string[] } | { held: { id: string; needs: string } };

export function reorder(order: readonly BriefEntry[], id: string, step: -1 | 1): Reorder {
  const ids = order.map((entry) => entry.id);
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return { ids };
  const upper = order[Math.min(from, to)];
  const lower = order[Math.max(from, to)];
  if (upper && lower?.after.includes(upper.id)) {
    return { held: { id: lower.id, needs: upper.id } };
  }
  const next = [...ids];
  [next[from], next[to]] = [next[to] ?? id, id];
  return { ids: next };
}

// An item taken out goes below the line, the one put back joins the end (the brief then puts it
// where its blocks allow).
export function toggleIn(
  inBrief: readonly string[],
  left: readonly string[],
  id: string,
): { inBrief: string[]; left: string[] } {
  if (inBrief.includes(id)) {
    return { inBrief: inBrief.filter((each) => each !== id), left: [...left, id] };
  }
  return { inBrief: [...inBrief, id], left: left.filter((each) => each !== id) };
}

// A file name for the exported brief: brief-work-2-bugs-1.md, short however many items it has.
export function briefFileName(ids: readonly string[]): string {
  const named = ids.slice(0, 3).map((id) => id.toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
  const more = ids.length > 3 ? [`and-${ids.length - 3}-more`] : [];
  return `brief-${[...named, ...more].join('-')}.md`;
}
