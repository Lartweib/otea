import type { Item } from '../../types.ts';
import type { BoardSummary, TemplateView } from '../api.ts';
import { madeWithOf, pairOf } from '../pair.ts';

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

// A row of Tus tableros: one board (with the boards a set made with it that stay apart), or a
// joined pair drawn once, at the place of whichever of its two boards comes first.
export type HomeRow =
  | { kind: 'one'; board: BoardSummary; madeWith: string[] }
  | { kind: 'pair'; parent: BoardSummary; child: BoardSummary; always: boolean };

export function homeRows(boards: readonly BoardSummary[]): HomeRow[] {
  const rows: HomeRow[] = [];
  const drawn = new Set<string>();
  for (const board of boards) {
    if (drawn.has(board.id)) continue;
    const pair = pairOf(boards, board.id);
    const parent = pair && boards.find((b) => b.id === pair.parent);
    const child = pair && boards.find((b) => b.id === pair.child);
    if (pair && parent && child) {
      drawn.add(parent.id).add(child.id);
      rows.push({ kind: 'pair', parent, child, always: pair.always });
      continue;
    }
    drawn.add(board.id);
    rows.push({ kind: 'one', board, madeWith: madeWithOf(boards, board.id).map((b) => b.name) });
  }
  return rows;
}

// The small map over the list: every board that divides into another board.
export type HomeJoin = { parent: BoardSummary; child: BoardSummary; always: boolean };

export function joinsMap(boards: readonly BoardSummary[]): HomeJoin[] {
  return homeRows(boards).flatMap((row) =>
    row.kind === 'pair' ? [{ parent: row.parent, child: row.child, always: row.always }] : [],
  );
}

// The links of today the map adds under the splits: a board whose open item holds back an open
// item of another board ("Errores puede frenar a Tareas · hoy ERR-214 frena TAR-3"), once per pair
// of boards. Links are free between boards; this only shows where they run.
export type BlockJoin = { from: BoardSummary; to: BoardSummary; blocker: string; blocked: string };

export function blockJoins(boards: readonly BoardSummary[], items: readonly Item[]): BlockJoin[] {
  const open = new Map(items.filter((it) => !it.closes).map((it) => [it.id, it]));
  const boardOf = (item: Item) => boards.find((b) => b.collection === item.collection);
  const out: BlockJoin[] = [];
  const seen = new Set<string>();
  for (const item of open.values()) {
    for (const rel of item.relations ?? []) {
      if (rel.kind !== 'blocks') continue;
      const other = open.get(rel.id);
      const from = boardOf(item);
      const to = other && boardOf(other);
      if (!from || !to || !other || from.id === to.id || seen.has(`${from.id}>${to.id}`)) continue;
      seen.add(`${from.id}>${to.id}`);
      out.push({ from, to, blocker: item.id, blocked: other.id });
    }
  }
  return out;
}

// The boards a template makes when it makes more than one (Cambios en varios repos, Producto).
export function setBoards(template: TemplateView): NonNullable<TemplateView['boards']> | null {
  return template.boards && template.boards.length > 1 ? template.boards : null;
}
