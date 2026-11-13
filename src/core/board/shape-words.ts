import { isEvidenceKind } from './model.ts';

// A board.json that is not the shape of a board, in words an agent can act on: where, in the
// board's own terms (step 2 "Fix" › handoff 1), what was expected, what the key is for and an
// example, both read from the published JSON Schema, then the JSON path to edit.

export type ShapeIssue = {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  expected?: string;
  values?: readonly unknown[];
  keys?: readonly string[];
};

type Node = {
  description?: string;
  examples?: unknown[];
  properties?: Record<string, Node>;
  additionalProperties?: Node | boolean;
  items?: Node;
  anyOf?: Node[];
  enum?: unknown[];
};

type Key = string | number;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function child(node: Node | undefined, key: Key): Node | undefined {
  if (!node) return undefined;
  if (typeof key === 'number') return node.items;
  const own = node.properties?.[key];
  if (own) return own;
  if (isRecord(node.additionalProperties)) return node.additionalProperties as Node;
  for (const branch of node.anyOf ?? []) {
    const found = child(branch, key);
    if (found) return found;
  }
  return undefined;
}

function nodeAt(schema: Node, path: readonly Key[]): Node | undefined {
  return path.reduce<Node | undefined>((node, key) => child(node, key), schema);
}

function valueAt(raw: unknown, path: readonly Key[]): unknown {
  return path.reduce<unknown>(
    (value, key) =>
      Array.isArray(value) || isRecord(value)
        ? (value as Record<string | number, unknown>)[key]
        : undefined,
    raw,
  );
}

function present(raw: unknown, path: readonly Key[]): boolean {
  const parent = valueAt(raw, path.slice(0, -1));
  const key = path.at(-1);
  if (key === undefined) return raw !== undefined;
  return (Array.isArray(parent) || isRecord(parent)) && Object.hasOwn(parent, key);
}

const named = (value: unknown) => {
  const name = isRecord(value) ? value.name : undefined;
  return typeof name === 'string' && name.trim() !== '' ? ` "${name}"` : '';
};

// One step of a path in the board's terms: step 2 "Fix", field "Steps" (fsteps), handoff 1.
function placeWord(raw: unknown, path: readonly Key[], index: number): string {
  const key = path[index] as Key;
  const parentKey = path[index - 1];
  const value = valueAt(raw, path.slice(0, index + 1));
  if (typeof key === 'number') {
    const n = key + 1;
    if (parentKey === 'steps') return `step ${n}${named(value)}`;
    if (parentKey === 'hand') {
      const handed = isRecord(value) && typeof value.ref === 'string' ? ` (${value.ref})` : '';
      return `handoff ${n}${handed}`;
    }
    if (parentKey === 'form') return `form entry ${n}`;
    if (parentKey === 'options') return `choice ${n}${named(value)}`;
    if (parentKey === 'motives') return `motive ${n}${named(value)}`;
    return `${String(parentKey)} entry ${n}`;
  }
  if (parentKey === 'parts' && index === 1) {
    const kind = isRecord(value) ? value.kind : undefined;
    const what = typeof kind === 'string' && isEvidenceKind(kind) ? 'evidence' : 'field';
    return `${what}${named(value)} (${key})`;
  }
  return key;
}

// The place a path names, in the board's terms; the board itself for the root.
export function placeOf(raw: unknown, path: readonly Key[]): string {
  const words: string[] = [];
  path.forEach((key, index) => {
    // A list's own key reads through its entry: steps.1 is "step 2", not "steps › step 2".
    const next = path[index + 1];
    if (typeof key === 'string' && typeof next === 'number') return;
    if (key === 'parts' && index === 0 && path.length > 1) return;
    words.push(placeWord(raw, path, index));
  });
  return words.length === 0 ? 'the board' : words.join(' › ');
}

const quoted = (value: unknown) => {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
};

function received(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (isRecord(value)) return 'an object';
  return quoted(value);
}

const EXPECTED: Readonly<Record<string, string>> = {
  string: 'a text',
  number: 'a number',
  boolean: 'true or false',
  array: 'a list',
  object: 'an object',
  record: 'an object',
};

function oneOf(values: readonly unknown[]): string {
  const words = values.map((value) => quoted(value));
  return words.length < 2
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`;
}

// What the key is for and an example of it, from the published schema.
function aboutKey(node: Node | undefined): string {
  if (!node?.description) return '';
  const example = node.examples?.find((value) => value !== '');
  const shown = example === undefined ? '' : `, e.g. ${JSON.stringify(example)}`;
  const description = node.description.charAt(0).toLowerCase() + node.description.slice(1);
  return ` (${description}${shown})`;
}

function wrongValue(issue: ShapeIssue, value: unknown): string {
  // The schema's own words first: "is not an id: ..." or "must be ...".
  if (issue.message.startsWith('is not')) return `${received(value)} ${issue.message}`;
  if (issue.message.startsWith('must')) return `${issue.message}, not ${received(value)}`;
  if (issue.code === 'invalid_type') {
    const expected = EXPECTED[issue.expected ?? ''] ?? issue.expected ?? 'something else';
    return `must be ${expected}, not ${received(value)}`;
  }
  if (issue.code === 'invalid_value' && issue.values) {
    const choices =
      issue.values.length === 1 ? quoted(issue.values[0]) : `one of ${oneOf(issue.values)}`;
    return `must be ${choices}, not ${received(value)}`;
  }
  if (issue.code === 'too_small') return 'must not be empty';
  return issue.message;
}

function knownKeys(node: Node | undefined): string {
  const keys = Object.keys(node?.properties ?? {});
  return keys.length === 0 ? '' : ` (it takes ${keys.join(', ')})`;
}

const listed = (words: readonly string[]) =>
  words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

const at = (path: readonly Key[]) => (path.length === 0 ? '' : ` [${path.join('.')}]`);

// The issues of a parse, one line each; the keys missing from one object read as one line.
export function shapeProblems(
  raw: unknown,
  issues: readonly ShapeIssue[],
  schema: Record<string, unknown>,
): string[] {
  const root = schema as Node;
  const lines: string[] = [];
  const missing = new Map<string, { path: Key[]; keys: string[] }>();
  for (const issue of issues) {
    const path = issue.path.map((key) => (typeof key === 'symbol' ? String(key) : key));
    if (issue.code === 'unrecognized_keys') {
      const keys = (issue.keys ?? []).map((key) => `"${key}"`);
      lines.push(
        `${placeOf(raw, path)}: ${keys.length === 1 ? 'a key' : 'keys'} a board does not know: ${listed(keys)}${knownKeys(nodeAt(root, path))}${at(path)}`,
      );
      continue;
    }
    const key = path.at(-1);
    if (typeof key === 'string' && !present(raw, path)) {
      const parent = path.slice(0, -1);
      const group = missing.get(parent.join('.')) ?? { path: parent, keys: [] };
      group.keys.push(key);
      missing.set(parent.join('.'), group);
      continue;
    }
    const value = valueAt(raw, path);
    const what = path.length === 0 ? '' : aboutKey(nodeAt(root, path));
    lines.push(`${placeOf(raw, path)}: ${wrongValue(issue, value)}${what}${at(path)}`);
  }
  const lacking = [...missing.values()].map(({ path, keys }) => {
    const [only] = keys;
    if (keys.length === 1 && only !== undefined)
      return `${placeOf(raw, path)} lacks ${only}${aboutKey(nodeAt(root, [...path, only]))}${at([...path, only])}`;
    return `${placeOf(raw, path)} lacks ${listed(keys)}${at(path)}`;
  });
  return [...lacking, ...lines];
}
