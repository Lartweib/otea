import type { Part } from '../studio/canvas.ts';

// A key for each drawn part. A part drawn in every row of a list is placed once for each row, so
// the same part comes up many times: a key that repeats makes React leave old tiles on the page
// after a tab changes. The nth time a part comes up, its key says so.
export function tileKeys(parts: readonly Part[]): string[] {
  const seen = new Map<string, number>();
  return parts.map((part) => {
    const base = `${part.slot}:${part.section ?? ''}:${part.index}`;
    const nth = seen.get(base) ?? 0;
    seen.set(base, nth + 1);
    return `${base}:${nth}`;
  });
}
