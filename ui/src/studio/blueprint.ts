import { stringify } from 'yaml';
import {
  blueprintTypeProblems,
  CONNECTION_KINDS,
  type Connection,
  readBlueprint,
} from '../../../src/core/blueprint.ts';
import type { PresetView } from '../types.ts';
import type { Board } from './api.ts';

// A blueprint as Studio draws it: boards and the links allowed between their types, checked by the
// same core that reads blueprint.yaml (src/core/blueprint.ts), and read as who waits for whom.

export type BlueprintDraft = { boards: Board[]; connections: string[]; playbook: string | null };

export const KINDS = CONNECTION_KINDS;

export type ReadDraft = { connections: Connection[]; problems: string[] };

// The draft as the core reads it, against the presets the project has.
export function readBlueprintDraft(
  name: string,
  draft: BlueprintDraft,
  presets: readonly PresetView[],
): ReadDraft {
  const names = draft.boards.map((board) => board.name);
  const twice = names.filter((board, index) => names.indexOf(board) !== index);
  const reading = readBlueprint(
    stringify({
      blueprint: name,
      blueprint_version: 1,
      boards: Object.fromEntries(
        draft.boards.map((board) => [board.name, { preset: board.preset }]),
      ),
      connections: draft.connections,
    }),
  );
  if (!reading.ok) return { connections: [], problems: reading.problems };
  const typesOf = (preset: string) => {
    const found = presets.find((each) => each.name === preset);
    return found ? found.types.map((type) => type.name) : `Preset "${preset}" not found`;
  };
  return {
    connections: reading.blueprint.connections,
    problems: [
      ...twice.map((board) => `boards: ${board} is listed twice`),
      ...blueprintTypeProblems(reading.blueprint, typesOf),
    ],
  };
}

export function connectionText({ kind, from, to }: Connection): string {
  return `${from.board}.${from.type} ${kind} ${to.board}.${to.type}`;
}

// ---------------------------------------------------------------- who waits for whom

type StateView = { name: string; turn: string; requires?: string[] };

export type TypeShape = {
  name: string;
  label: string;
  icon?: string;
  waits: Array<{ state: string; on: 'children' | 'blockers' }>;
};

// A board's types, each with the states that wait (requires) and on what.
export function shapesOf(preset: PresetView | undefined): TypeShape[] {
  return (preset?.types ?? []).map((type) => ({
    name: type.name,
    label: type.label,
    ...(type.icon === undefined ? {} : { icon: type.icon }),
    waits: (type.states as StateView[]).flatMap((state) =>
      (state.requires ?? []).map((requirement) => ({
        state: state.name,
        on: requirement === 'children_closed' ? ('children' as const) : ('blockers' as const),
      })),
    ),
  }));
}

export type Reading =
  // A blocks link the target waits on: the state that waits for it.
  | { kind: 'waits'; connection: Connection; state: string | undefined }
  | { kind: 'children'; type: string; state: string }
  | { kind: 'fed'; connection: Connection }
  | { kind: 'holds'; connection: Connection; state: string | undefined };

// What a board reads in the blueprint: what it waits for, what feeds it without waiting, and whom it
// holds up. A blocks link whose target has no state requiring blockers_closed waits for nothing.
export function readingsFor(
  board: string,
  connections: readonly Connection[],
  shapes: ReadonlyMap<string, TypeShape[]>,
): Reading[] {
  const waitingState = (end: { board: string; type: string }) =>
    shapes
      .get(end.board)
      ?.find((type) => type.name === end.type)
      ?.waits.find((wait) => wait.on === 'blockers')?.state;
  const readings: Reading[] = [];
  for (const connection of connections) {
    const touches = connection.from.board === board || connection.to.board === board;
    if (!touches) continue;
    if (connection.kind === 'blocks') {
      const state = waitingState(connection.to);
      readings.push(
        connection.to.board === board
          ? { kind: 'waits', connection, state }
          : { kind: 'holds', connection, state },
      );
    } else {
      readings.push({ kind: 'fed', connection });
    }
  }
  for (const type of shapes.get(board) ?? []) {
    for (const wait of type.waits.filter(({ on }) => on === 'children')) {
      readings.push({ kind: 'children', type: type.name, state: wait.state });
    }
  }
  return readings;
}

// Boards that wait on each other through blocks, in a loop: two boards that stall for good.
export function blockLoops(connections: readonly Connection[]): string[][] {
  const edges = connections.filter(({ kind }) => kind === 'blocks');
  const loops: string[][] = [];
  const seen = new Set<string>();
  for (const start of new Set(edges.map(({ from }) => from.board))) {
    const walk = (at: string, path: string[]) => {
      for (const { from, to } of edges) {
        if (from.board !== at) continue;
        if (to.board === start) {
          const key = [...path].sort().join(',');
          if (!seen.has(key)) {
            seen.add(key);
            loops.push([...path, start]);
          }
        } else if (!path.includes(to.board)) walk(to.board, [...path, to.board]);
      }
    };
    walk(start, [start]);
  }
  return loops;
}

// ---------------------------------------------------------------- the diagram's geometry

export const BOX_W = 210;
export const GAP = 120;
const HEAD = 52;
const ROW = 34;
const WAIT = 22;

export type Box = {
  board: Board;
  x: number;
  y: number;
  h: number;
  rows: Array<{ type: TypeShape; y: number }>;
};

// The board with the most links in the middle, the others on either side, in a row: with three or
// four boards, the usual case, every link is a short, almost straight line.
export function layoutBoxes(
  boards: readonly Board[],
  connections: readonly Connection[],
  shapes: ReadonlyMap<string, TypeShape[]>,
): Box[] {
  const degree = (name: string) =>
    connections.filter(({ from, to }) => from.board === name || to.board === name).length;
  const ranked = [...boards].sort((a, b) => degree(b.name) - degree(a.name));
  const row: Board[] = [];
  ranked.forEach((board, index) => {
    if (index % 2 === 0) row.push(board);
    else row.unshift(board);
  });
  return row.map((board, index) => {
    let y = HEAD;
    const rows = (shapes.get(board.name) ?? []).map((type) => {
      const at = { type, y: y + ROW / 2 };
      y += ROW + type.waits.length * WAIT;
      return at;
    });
    return { board, x: 24 + index * (BOX_W + GAP), y: 60, h: Math.max(y + 10, HEAD + ROW), rows };
  });
}

export type Link = { connection: Connection; d: string; label: { x: number; y: number } };

// Each link from one type's port to the other's: the facing sides when the boards sit next to each
// other, an arc over the row when another board stands between them.
export function linkPaths(boxes: readonly Box[], connections: readonly Connection[]): Link[] {
  const port = (end: { board: string; type: string }) => {
    const box = boxes.find(({ board }) => board.name === end.board);
    const row = box?.rows.find(({ type }) => type.name === end.type);
    return box && row ? { box, y: box.y + row.y } : undefined;
  };
  return connections.flatMap((connection, index) => {
    const a = port(connection.from);
    const b = port(connection.to);
    if (!a || !b) return [];
    const ia = boxes.indexOf(a.box);
    const ib = boxes.indexOf(b.box);
    const rightward = ib > ia;
    const x1 = rightward ? a.box.x + BOX_W : a.box.x;
    const x2 = rightward ? b.box.x : b.box.x + BOX_W;
    if (Math.abs(ib - ia) === 1) {
      const mid = (x1 + x2) / 2;
      return [
        {
          connection,
          d: `M${x1} ${a.y} C${mid} ${a.y} ${mid} ${b.y} ${x2} ${b.y}`,
          label: { x: mid, y: (a.y + b.y) / 2 },
        },
      ];
    }
    // Over the boards between: up from both ports, across above the row.
    const top = 26 - (index % 3) * 8;
    const sx = rightward ? x1 + 20 : x1 - 20;
    const ex = rightward ? x2 - 20 : x2 + 20;
    return [
      {
        connection,
        d: `M${x1} ${a.y} C${sx} ${a.y} ${sx} ${top} ${(x1 + x2) / 2} ${top} C${ex} ${top} ${ex} ${b.y} ${x2} ${b.y}`,
        label: { x: (x1 + x2) / 2, y: top },
      },
    ];
  });
}
