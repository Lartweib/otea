import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { OteaError } from './errors.ts';
import { describeRelation, type RelationKind } from './relations.ts';

// A blueprint is a set of boards, each a collection built from a preset, plus the links allowed
// between them: a connection lets an item of one type in one board link, with one kind, to an item
// of one type in another. `parent` stays inside a board, so it never connects two.
export const CONNECTION_KINDS = ['blocks', 'implements', 'relates', 'duplicates'] as const;

export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export type BoardType = { board: string; type: string };

export type Connection = { kind: ConnectionKind; from: BoardType; to: BoardType };

export type Board = { name: string; preset: string };

export const SOURCE_ORIGINS = ['official', 'project', 'path'] as const;

export type SourceOrigin = (typeof SOURCE_ORIGINS)[number];

// Where a project's copy came from, and the hash of the source when it was copied: an official or
// project blueprint is found again by name, one read from a path by that path.
export type BlueprintSource = { origin: SourceOrigin; path?: string; hash: string };

export type Blueprint = {
  name: string;
  version: number;
  playbook?: string;
  boards: Board[];
  connections: Connection[];
  source?: BlueprintSource;
};

export type BlueprintReading =
  | { ok: true; blueprint: Blueprint }
  | { ok: false; problems: string[] };

const NAME = /^[a-z0-9][a-z0-9-]*$/;
const NAME_MESSAGE = 'must be lowercase letters, digits and dashes';

// <board>.<type> <kind> <board>.<type>, as `otea link` reads: `bugs.bug blocks work.task`.
const CONNECTION =
  /^([a-z0-9][a-z0-9-]*)\.([a-z][a-z0-9_]*)\s+(\S+)\s+([a-z0-9][a-z0-9-]*)\.([a-z][a-z0-9_]*)$/;

const blueprintSchema = z.strictObject({
  blueprint: z.string().regex(NAME, NAME_MESSAGE),
  blueprint_version: z.int().positive(),
  playbook: z.string().optional(),
  boards: z
    .record(
      z.string().regex(NAME, `board names ${NAME_MESSAGE}`),
      z.strictObject({ preset: z.string() }),
    )
    .refine((boards) => Object.keys(boards).length > 0, 'declare at least one board'),
  connections: z.array(z.string()).nullish(),
  // Only a project's copy records its source.
  source: z
    .strictObject({ origin: z.enum(SOURCE_ORIGINS), path: z.string().optional(), hash: z.string() })
    .optional(),
});

const KINDS = CONNECTION_KINDS.join(', ');
const KINDS_OR = 'blocks, implements, relates or duplicates';

export function connectionText({ kind, from, to }: Connection): string {
  return `${from.board}.${from.type} ${kind} ${to.board}.${to.type}`;
}

const sameEnd = (a: BoardType, b: BoardType) => a.board === b.board && a.type === b.type;

// The same connection, a relates one written either way included.
function sameConnection(a: Connection, b: Connection): boolean {
  if (a.kind !== b.kind) return false;
  if (sameEnd(a.from, b.from) && sameEnd(a.to, b.to)) return true;
  return a.kind === 'relates' && sameEnd(a.from, b.to) && sameEnd(a.to, b.from);
}

function isConnectionKind(kind: string): kind is ConnectionKind {
  return (CONNECTION_KINDS as readonly string[]).includes(kind);
}

type ConnectionReading = { connection?: Connection; problem?: string };

function readConnection(text: string, at: string, boards: readonly string[]): ConnectionReading {
  const match = CONNECTION.exec(text.trim());
  if (!match) {
    return { problem: `${at}: "${text}" does not read <board>.<type> <kind> <board>.<type>` };
  }
  const [, fromBoard = '', fromType = '', kind = '', toBoard = '', toType = ''] = match;
  if (kind === 'parent') {
    return {
      problem: `${at}: parent links stay inside one board; connect boards with ${KINDS_OR}`,
    };
  }
  if (!isConnectionKind(kind)) return { problem: `${at}: unknown link kind "${kind}" (${KINDS})` };
  for (const board of [fromBoard, toBoard]) {
    if (!boards.includes(board)) {
      return { problem: `${at}: unknown board "${board}" (boards: ${boards.join(', ')})` };
    }
  }
  if (fromBoard === toBoard) {
    return {
      problem: `${at}: joins board ${fromBoard} to itself; links within a board are always allowed`,
    };
  }
  const from = { board: fromBoard, type: fromType };
  return { connection: { kind, from, to: { board: toBoard, type: toType } } };
}

function readConnections(texts: readonly string[], boards: readonly string[]) {
  const connections: Connection[] = [];
  const problems: string[] = [];
  texts.forEach((text, index) => {
    const at = `connections[${index}]`;
    const { connection, problem } = readConnection(text, at, boards);
    if (problem) problems.push(problem);
    if (!connection) return;
    if (connections.some((seen) => sameConnection(seen, connection))) {
      problems.push(`${at}: "${connectionText(connection)}" is listed twice`);
      return;
    }
    connections.push(connection);
  });
  return { connections, problems };
}

function parseYaml(text: string): { ok: true; value: unknown } | { ok: false; problem: string } {
  try {
    return { ok: true, value: parse(text) };
  } catch (error) {
    return { ok: false, problem: `invalid YAML: ${(error as Error).message.split('\n')[0]}` };
  }
}

export function readBlueprint(text: string): BlueprintReading {
  const yaml = parseYaml(text);
  if (!yaml.ok) return { ok: false, problems: [yaml.problem] };
  const result = blueprintSchema.safeParse(yaml.value);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, problems };
  }
  const raw = result.data;
  const boards = Object.entries(raw.boards).map(([name, { preset }]) => ({ name, preset }));
  const read = readConnections(
    raw.connections ?? [],
    boards.map(({ name }) => name),
  );
  if (read.problems.length > 0) return { ok: false, problems: read.problems };
  const blueprint: Blueprint = {
    name: raw.blueprint,
    version: raw.blueprint_version,
    boards,
    connections: read.connections,
  };
  if (raw.playbook !== undefined) blueprint.playbook = raw.playbook;
  if (raw.source !== undefined) {
    const { origin, path, hash } = raw.source;
    blueprint.source = { origin, hash, ...(path === undefined ? {} : { path }) };
  }
  return { ok: true, blueprint };
}

export function parseBlueprint(text: string): Blueprint {
  const reading = readBlueprint(text);
  if (reading.ok) return reading.blueprint;
  throw new OteaError('invalid_blueprint', `Invalid blueprint: ${reading.problems.join('; ')}`);
}

// The blueprint as YAML, in the format it is read from.
export function blueprintYaml(blueprint: Blueprint): string {
  const doc: Record<string, unknown> = {
    blueprint: blueprint.name,
    blueprint_version: blueprint.version,
  };
  if (blueprint.playbook !== undefined) doc.playbook = blueprint.playbook;
  doc.boards = Object.fromEntries(blueprint.boards.map(({ name, preset }) => [name, { preset }]));
  doc.connections = blueprint.connections.map(connectionText);
  if (blueprint.source !== undefined) doc.source = blueprint.source;
  return stringify(doc);
}

// The types a preset declares, or why it cannot be used (unknown, or invalid).
export type TypesOf = (preset: string) => readonly string[] | string;

// What the presets say about a blueprint: each board's preset exists, and each connection names
// types its boards' presets declare.
export function blueprintTypeProblems(blueprint: Blueprint, typesOf: TypesOf): string[] {
  const types = new Map(blueprint.boards.map(({ name, preset }) => [name, typesOf(preset)]));
  const problems = blueprint.boards.flatMap(({ name }) => {
    const found = types.get(name);
    return typeof found === 'string' ? [`boards.${name}.preset: ${found}`] : [];
  });
  const presetOf = new Map(blueprint.boards.map(({ name, preset }) => [name, preset]));
  blueprint.connections.forEach(({ from, to }, index) => {
    for (const end of [from, to]) {
      const declared = types.get(end.board);
      if (typeof declared === 'string' || declared === undefined || declared.includes(end.type))
        continue;
      problems.push(
        `connections[${index}]: board ${end.board} (preset ${presetOf.get(end.board)}) has no type "${end.type}" (types: ${declared.join(', ')})`,
      );
    }
  });
  return problems;
}

// Where an item sits: its id, its collection (a board, when the blueprint lists it) and its type.
export type ItemPlace = { id: string; collection: string; type: string };

// Once a project has a blueprint, a link between two of its boards must be one it declares. Links
// within a board, parents, and boards the blueprint does not list are not its concern.
export function assertInBlueprint(
  blueprint: Blueprint | undefined,
  kind: RelationKind,
  from: ItemPlace,
  to: ItemPlace,
): void {
  if (blueprint === undefined || kind === 'parent' || from.collection === to.collection) return;
  const boards = blueprint.boards.map(({ name }) => name);
  if (!boards.includes(from.collection) || !boards.includes(to.collection)) return;
  const wanted: Connection = {
    kind,
    from: { board: from.collection, type: from.type },
    to: { board: to.collection, type: to.type },
  };
  if (blueprint.connections.some((connection) => sameConnection(connection, wanted))) return;
  const between = blueprint.connections.filter(
    (connection) =>
      [connection.from.board, connection.to.board].includes(from.collection) &&
      [connection.from.board, connection.to.board].includes(to.collection),
  );
  const pair = `${from.collection} and ${to.collection}`;
  const allowed =
    between.length === 0
      ? `it declares no link between ${pair}`
      : `between ${pair} it allows: ${between.map(connectionText).join(', ')}`;
  const link = describeRelation({ kind, from: from.id, to: to.id });
  throw new OteaError(
    'link_not_in_blueprint',
    `The blueprint "${blueprint.name}" does not allow ${link} (${connectionText(wanted)}); ${allowed}`,
  );
}

// What a source changed since a project copied it: its version, its boards and its connections.
export type BlueprintDiff = {
  version?: { from: number; to: number };
  boardsAdded: Board[];
  boardsRemoved: Board[];
  boardsChanged: Array<{ name: string; from: string; to: string }>;
  connectionsAdded: Connection[];
  connectionsRemoved: Connection[];
};

export function diffBlueprints(copy: Blueprint, source: Blueprint): BlueprintDiff {
  const named = (boards: Board[], name: string) => boards.find((board) => board.name === name);
  const absent = (connections: Connection[]) => (connection: Connection) =>
    !connections.some((other) => sameConnection(other, connection));
  const diff: BlueprintDiff = {
    boardsAdded: source.boards.filter(({ name }) => !named(copy.boards, name)),
    boardsRemoved: copy.boards.filter(({ name }) => !named(source.boards, name)),
    boardsChanged: copy.boards.flatMap(({ name, preset }) => {
      const now = named(source.boards, name);
      return now && now.preset !== preset ? [{ name, from: preset, to: now.preset }] : [];
    }),
    connectionsAdded: source.connections.filter(absent(copy.connections)),
    connectionsRemoved: copy.connections.filter(absent(source.connections)),
  };
  if (copy.version !== source.version) diff.version = { from: copy.version, to: source.version };
  return diff;
}

// One line per change, as `otea blueprint status` prints them.
export function describeDiff(diff: BlueprintDiff): string[] {
  return [
    ...(diff.version ? [`version ${diff.version.from} -> ${diff.version.to}`] : []),
    ...diff.boardsAdded.map(({ name, preset }) => `+ board ${name} (preset ${preset})`),
    ...diff.boardsRemoved.map(({ name, preset }) => `- board ${name} (preset ${preset})`),
    ...diff.boardsChanged.map(({ name, from, to }) => `~ board ${name}: preset ${from} -> ${to}`),
    ...diff.connectionsAdded.map((connection) => `+ ${connectionText(connection)}`),
    ...diff.connectionsRemoved.map((connection) => `- ${connectionText(connection)}`),
  ];
}
