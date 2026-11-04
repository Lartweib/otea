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

type StateView = { name: string; turn: string; closes?: string; requires?: string[] };

type WaitsOn = 'children' | 'blockers';

export type TypeShape = {
  name: string;
  label: string;
  icon?: string;
  waits: Array<{ state: string; on: WaitsOn }>;
  // Its states in order, each with what entering it waits for, when it waits.
  states: Array<{ name: string; waits?: WaitsOn }>;
};

const waitsOn = (requirement: string): WaitsOn =>
  requirement === 'children_closed' ? 'children' : 'blockers';

// A board's types, each with its states and the ones that wait (requires) and on what.
export function shapesOf(preset: PresetView | undefined): TypeShape[] {
  return (preset?.types ?? []).map((type) => {
    const states = type.states as StateView[];
    return {
      name: type.name,
      label: type.label,
      ...(type.icon === undefined ? {} : { icon: type.icon }),
      waits: states.flatMap((state) =>
        (state.requires ?? []).map((requirement) => ({
          state: state.name,
          on: waitsOn(requirement),
        })),
      ),
      // The incomplete state and the ones that discard are left out: no link is about them.
      states: states.flatMap((state) => {
        if (state.name === type.incomplete || state.closes === 'discarded') return [];
        const first = state.requires?.[0];
        // Blockers first: the wait a blocks link means.
        const on = state.requires?.includes('blockers_closed')
          ? 'blockers'
          : first && waitsOn(first);
        return [on ? { name: state.name, waits: on } : { name: state.name }];
      }),
    };
  });
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

// ---------------------------------------------------------------- the canvas of cards

// Each board is a card: its head, a row per type (with its states, when they show), and a sample
// row. These sizes are the card's CSS (studio.css, .st-bc), so a link meets its type's row.
export const CARD_W = 212;
export const COL_GAP = 132;
export const ROW_GAP = 48;
export const CARD_HEAD = 54;
export const TYPE_ROW = 40;
export const STATE_ROW = 20;
export const WAIT_LINE = 16;
export const SAMPLE_H = 60;
const CARD_PAD = 8;
const MARGIN = 28;

export type CardMode = 'types' | 'states';

export type Card = {
  board: Board;
  x: number;
  y: number;
  h: number;
  // Each type's row: the middle of the row, from the card's top, where its ports sit.
  rows: Array<{ type: TypeShape; y: number }>;
};

// How far right a board sits: one column past the boards that link to it, so a link reads left to
// right. A board in a loop, or without links, stays in the first column it reaches.
function columnsOf(boards: readonly Board[], connections: readonly Connection[]) {
  const column = new Map(boards.map(({ name }) => [name, 0]));
  for (let pass = 0; pass < boards.length; pass += 1) {
    for (const { from, to } of connections) {
      const next = (column.get(from.board) ?? 0) + 1;
      if (from.board !== to.board && next < boards.length && next > (column.get(to.board) ?? 0))
        column.set(to.board, next);
    }
  }
  return column;
}

function cardHeight(shapes: readonly TypeShape[], mode: CardMode, sample: boolean) {
  let y = CARD_HEAD;
  const rows = shapes.map((type) => {
    const at = { type, y: y + TYPE_ROW / 2 };
    y += TYPE_ROW;
    if (mode === 'states') {
      for (const state of type.states) y += STATE_ROW + (state.waits ? WAIT_LINE : 0);
    }
    return at;
  });
  return { rows, h: y + (sample ? SAMPLE_H : 0) + CARD_PAD };
}

// The cards in columns, each column a stack. A card faces the cards that link to it: it starts at
// the height of their ports, and moves down only to clear the card above it.
export function layoutCards(
  boards: readonly Board[],
  connections: readonly Connection[],
  shapes: ReadonlyMap<string, TypeShape[]>,
  mode: CardMode,
  hasSample: (board: string) => boolean,
): Card[] {
  const column = columnsOf(boards, connections);
  const cards: Card[] = [];
  const bottom = new Map<number, number>();
  const ordered = [...boards].sort((a, b) => (column.get(a.name) ?? 0) - (column.get(b.name) ?? 0));
  for (const board of ordered) {
    const at = column.get(board.name) ?? 0;
    const { rows, h } = cardHeight(shapes.get(board.name) ?? [], mode, hasSample(board.name));
    const facing = connections.flatMap(({ from, to }) => {
      if (to.board !== board.name) return [];
      const source = cards.find((card) => card.board.name === from.board);
      const row = source?.rows.find(({ type }) => type.name === from.type);
      const own = rows.find(({ type }) => type.name === to.type);
      return source && row && own ? [source.y + row.y - own.y] : [];
    });
    const wanted = facing.length > 0 ? Math.min(...facing) + 2 * STATE_ROW : MARGIN;
    const y = Math.max(wanted, bottom.get(at) ?? MARGIN);
    cards.push({ board, x: MARGIN + at * (CARD_W + COL_GAP), y, h, rows });
    bottom.set(at, y + h + ROW_GAP);
  }
  return boards.flatMap((board) => cards.filter((card) => card.board === board));
}

export type CardLink = {
  connection: Connection;
  text: string;
  d: string;
  label: { x: number; y: number };
  // The side of each card the link leaves and enters.
  sides: { from: 'l' | 'r'; to: 'l' | 'r' };
};

// Each link from its source type's port to its target type's: the facing sides of two columns, or
// out of the right side and back in when both cards share a column.
export function cardLinks(cards: readonly Card[], connections: readonly Connection[]): CardLink[] {
  const port = (end: { board: string; type: string }) => {
    const card = cards.find(({ board }) => board.name === end.board);
    const row = card?.rows.find(({ type }) => type.name === end.type);
    return card && row ? { card, y: card.y + row.y } : undefined;
  };
  return connections.flatMap((connection): CardLink[] => {
    const a = port(connection.from);
    const b = port(connection.to);
    if (!a || !b) return [];
    const text = connectionText(connection);
    if (a.card.x === b.card.x) {
      const x = a.card.x + CARD_W;
      const bend = x + 56;
      return [
        {
          connection,
          text,
          d: `M${x} ${a.y} C${bend} ${a.y} ${bend} ${b.y} ${x} ${b.y}`,
          label: { x: x + 42, y: (a.y + b.y) / 2 },
          sides: { from: 'r', to: 'r' },
        },
      ];
    }
    const rightward = b.card.x > a.card.x;
    const x1 = rightward ? a.card.x + CARD_W : a.card.x;
    const x2 = rightward ? b.card.x : b.card.x + CARD_W;
    const pull = Math.max(40, Math.abs(x2 - x1) / 2) * (rightward ? 1 : -1);
    return [
      {
        connection,
        text,
        d: `M${x1} ${a.y} C${x1 + pull} ${a.y} ${x2 - pull} ${b.y} ${x2} ${b.y}`,
        label: { x: (x1 + x2) / 2, y: (a.y + b.y) / 2 },
        sides: rightward ? { from: 'r', to: 'l' } : { from: 'l', to: 'r' },
      },
    ];
  });
}

// The canvas's size: every card, with room around them.
export function canvasSize(cards: readonly Card[]): { width: number; height: number } {
  return {
    width: Math.max(...cards.map(({ x }) => x + CARD_W + MARGIN + 60), 320),
    height: Math.max(...cards.map(({ y, h }) => y + h + MARGIN), 200),
  };
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
