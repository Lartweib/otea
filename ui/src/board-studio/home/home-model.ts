import type { BoardSummary } from '../api.ts';

// What Studio's home decides without drawing (home-model.test.ts).

export type BoardStatusView =
  | { kind: 'live'; version: number }
  | { kind: 'changed'; version: number }
  | { kind: 'draft' }
  | { kind: 'waiting'; agent: string | null };

// A board's status, with the agent drafting it when known.
export function statusOf(board: BoardSummary, drafter: string | null = null): BoardStatusView {
  switch (board.status) {
    case 'waiting':
      return { kind: 'waiting', agent: drafter };
    case 'draft':
      return { kind: 'draft' };
    case 'changed':
      return { kind: 'changed', version: board.liveVersion ?? 0 };
    default:
      return { kind: 'live', version: board.liveVersion ?? 0 };
  }
}

const norm = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

// The name, or the name and the first number that no board has.
export function freeName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map(norm));
  if (!used.has(norm(name))) return name;
  for (let k = 2; ; k++) if (!used.has(norm(`${name} ${k}`))) return `${name} ${k}`;
}

// What is wrong with a new board's name, before asking the server (which checks it again).
export function nameIssue(name: string, taken: readonly string[]): 'empty' | 'taken' | null {
  if (!norm(name)) return 'empty';
  return taken.some((t) => norm(t) === norm(name)) ? 'taken' : null;
}

// The boards an agent was drafting and whose draft has now arrived.
export function arrivedDrafts(
  before: readonly BoardSummary[] | null,
  after: readonly BoardSummary[],
): BoardSummary[] {
  if (!before) return [];
  const waited = new Set(before.filter((b) => b.status === 'waiting').map((b) => b.id));
  return after.filter((b) => waited.has(b.id) && b.status !== 'waiting');
}

const isLive = (b: BoardSummary) => b.status === 'live' || b.status === 'changed';

// The collections of the boards published since the list before (the rail draws them in once).
export function freshlyLive(
  before: readonly BoardSummary[] | null,
  after: readonly BoardSummary[],
): string[] {
  if (!before) return [];
  const was = new Set(before.filter(isLive).map((b) => b.id));
  return after
    .filter((b) => isLive(b) && !was.has(b.id) && b.collection)
    .map((b) => b.collection as string);
}
