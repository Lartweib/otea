// "N por configurar" on Studio's pair row (WORKSPACE row 7): the editor's "Qué falta configurar"
// checklist reports how many of its rows are still open for the pair's parent board (0 once it is
// done or hidden), and the home reads it back. It is this browser's convenience, kept in memory and,
// when storage works, across reloads; a lost count only hides the hint.

const KEY = 'otea.studio.setupLeft';
let counts: Record<string, number> | null = null;

function read(): Record<string, number> {
  if (counts) return counts;
  try {
    const kept = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as unknown;
    counts = kept && typeof kept === 'object' ? (kept as Record<string, number>) : {};
  } catch {
    counts = {};
  }
  return counts;
}

export function reportSetupLeft(board: string, left: number): void {
  const all = read();
  if (left > 0) all[board] = left;
  else delete all[board];
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage may be off: the count lives until the page reloads.
  }
}

export function setupLeftOf(board: string): number {
  return read()[board] ?? 0;
}
