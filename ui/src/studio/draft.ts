import { isMap, isSeq, parse, parseDocument } from 'yaml';
import { type PresetReading, readPreset } from '../../../src/core/preset.ts';

// A preset draft is its YAML text, edited through the YAML document so every change keeps the
// file's comments, order and flow style. The browser reads each draft with the same core that
// `otea validate` runs (src/core/preset.ts): Studio has no rules of its own.

export type Path = readonly (string | number)[];

export type RawField = { module?: string; required?: string; values?: string[]; default?: string };
export type RawState = { turn?: string; closes?: string; requires?: string | string[] };
export type RawTransition = { from?: string | string[]; to?: string; by?: string; reason?: string };
export type RawWorkflow = {
  initial?: string;
  incomplete?: string;
  states?: Record<string, RawState>;
  transitions?: RawTransition[];
  gates?: Record<string, string[]>;
};
export type RawType = {
  label?: string;
  icon?: string;
  fields?: Record<string, RawField>;
  workflow?: RawWorkflow;
  layout?: unknown;
  playbook?: string;
  children?: string[];
  root?: boolean;
};
export type RawPreset = {
  preset?: string;
  preset_version?: number;
  playbook?: string;
  fields?: Record<string, RawField>;
  workflow?: RawWorkflow;
  types?: Record<string, RawType>;
  view?: { kind?: string; group_by?: string; columns?: string[] };
};

export type Draft = { yaml: string; playbooks: Record<string, string> };

// The draft as plain data, for the editor to draw; an empty object when the YAML does not parse.
export function rawOf(yaml: string): RawPreset {
  try {
    const value: unknown = parse(yaml);
    return typeof value === 'object' && value !== null ? (value as RawPreset) : {};
  } catch {
    return {};
  }
}

// With the draft's playbooks, the reading also checks that each gate is called, as otea validate does.
export function readDraft(
  yaml: string,
  playbooks?: Readonly<Record<string, string>>,
): PresetReading {
  return readPreset(yaml, playbooks === undefined ? {} : { playbooks });
}

// Small values (a field, a state, a move) are written in flow style, as the official presets do.
function edit(yaml: string, change: (doc: ReturnType<typeof parseDocument>) => void): string {
  const doc = parseDocument(yaml);
  if (doc.errors.length > 0) return yaml;
  change(doc);
  return doc.toString({ lineWidth: 100 });
}

function flowNode(doc: ReturnType<typeof parseDocument>, value: unknown) {
  const node = doc.createNode(value);
  if (isMap(node) || isSeq(node)) node.flow = true;
  for (const item of isMap(node) || isSeq(node) ? node.items : []) {
    const inner = isMap(node) ? (item as { value?: unknown }).value : item;
    if (isSeq(inner) || isMap(inner)) inner.flow = true;
  }
  return node;
}

// Sets the value at a path (a new map on the way is block style), in flow style when it is a map
// or a list; undefined removes it, and an empty map or list left behind goes too.
export function setIn(yaml: string, path: Path, value: unknown): string {
  return edit(yaml, (doc) => {
    if (value === undefined) {
      doc.deleteIn(path);
      for (let depth = path.length - 1; depth > 0; depth -= 1) {
        const parent = doc.getIn(path.slice(0, depth), true);
        if ((isMap(parent) || isSeq(parent)) && parent.items.length === 0) {
          doc.deleteIn(path.slice(0, depth));
        } else break;
      }
      return;
    }
    for (let depth = 1; depth < path.length; depth += 1) {
      if (doc.getIn(path.slice(0, depth), true) === undefined) {
        doc.setIn(path.slice(0, depth), doc.createNode({}));
      }
    }
    const current = doc.getIn(path, true);
    if (isMap(current) && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Keep the map (and its comments): set each key, drop those no longer there.
      const next = value as Record<string, unknown>;
      for (const key of current.items.map((pair) =>
        String((pair.key as { value?: unknown }).value ?? pair.key),
      )) {
        if (!(key in next)) current.delete(key);
      }
      for (const [key, inner] of Object.entries(next)) {
        if (inner === undefined) current.delete(key);
        else current.set(key, Array.isArray(inner) ? flowNode(doc, inner) : inner);
      }
      return;
    }
    doc.setIn(path, flowNode(doc, value));
  });
}

// Appends to the list at a path, creating it.
export function pushIn(yaml: string, path: Path, value: unknown): string {
  return edit(yaml, (doc) => {
    const list = doc.getIn(path, true);
    if (isSeq(list)) list.add(flowNode(doc, value));
    else doc.setIn(path, doc.createNode([flowNode(doc, value)]));
  });
}

// Renames a key of the map at a path, keeping its value, place and comments.
export function renameIn(yaml: string, path: Path, from: string, to: string): string {
  return edit(yaml, (doc) => {
    const map = doc.getIn(path, true);
    if (!isMap(map)) return;
    const pair = map.items.find((item) => String((item.key as { value?: unknown }).value) === from);
    if (pair) pair.key = doc.createNode(to);
  });
}

// Where a type's things live: its own fields, and the workflow it uses (its own, or the preset's).
export function workflowPath(raw: RawPreset, type: string | undefined): Path {
  return type !== undefined && raw.types?.[type]?.workflow
    ? ['types', type, 'workflow']
    : ['workflow'];
}

export function workflowOf(raw: RawPreset, type: string | undefined): RawWorkflow {
  const path = workflowPath(raw, type);
  return (path.length === 1 ? raw.workflow : raw.types?.[type as string]?.workflow) ?? {};
}

export const asList = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

// Renames a state everywhere the workflow names it: its key, initial and incomplete, every move and
// every gate. Prose (the playbook) is not rewritten.
export function renameState(yaml: string, at: Path, from: string, to: string): string {
  const raw = rawOf(yaml);
  const workflow = (at.length === 1 ? raw.workflow : raw.types?.[String(at[1])]?.workflow) ?? {};
  let next = renameIn(yaml, [...at, 'states'], from, to);
  if (workflow.initial === from) next = setIn(next, [...at, 'initial'], to);
  if (workflow.incomplete === from) next = setIn(next, [...at, 'incomplete'], to);
  (workflow.transitions ?? []).forEach((move, index) => {
    const sources = asList(move.from);
    if (sources.includes(from)) {
      const renamed = sources.map((source) => (source === from ? to : source));
      next = setIn(
        next,
        [...at, 'transitions', index, 'from'],
        Array.isArray(move.from) ? renamed : renamed[0],
      );
    }
    if (move.to === from) next = setIn(next, [...at, 'transitions', index, 'to'], to);
  });
  for (const [action, states] of Object.entries(workflow.gates ?? {})) {
    if (states.includes(from)) {
      next = setIn(
        next,
        [...at, 'gates', action],
        states.map((state) => (state === from ? to : state)),
      );
    }
  }
  return next;
}

// Removes a state and what names it: moves into it, it as a source of the others, its gates.
export function removeState(yaml: string, at: Path, name: string): string {
  const workflow =
    (at.length === 1 ? rawOf(yaml).workflow : rawOf(yaml).types?.[String(at[1])]?.workflow) ?? {};
  let next = setIn(yaml, [...at, 'states', name], undefined);
  const moves = workflow.transitions ?? [];
  for (let index = moves.length - 1; index >= 0; index -= 1) {
    const move = moves[index] as RawTransition;
    const sources = asList(move.from).filter((source) => source !== name);
    if (move.to === name || sources.length === 0) {
      next = setIn(next, [...at, 'transitions', index], undefined);
    } else if (sources.length !== asList(move.from).length) {
      next = setIn(
        next,
        [...at, 'transitions', index, 'from'],
        sources.length === 1 ? sources[0] : sources,
      );
    }
  }
  for (const [action, states] of Object.entries(workflow.gates ?? {})) {
    if (states.includes(name)) {
      const kept = states.filter((state) => state !== name);
      next = setIn(next, [...at, 'gates', action], kept.length > 0 ? kept : undefined);
    }
  }
  return next;
}

// The draft's lines against the saved ones: each line kept, added or removed, in order.
export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * cols + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * cols + j + 1] as number) + 1
          : Math.max(lcs[(i + 1) * cols + j] as number, lcs[i * cols + j + 1] as number);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] as string });
      i += 1;
      j += 1;
    } else if (
      j < b.length &&
      (i === a.length || (lcs[i * cols + j + 1] as number) >= (lcs[(i + 1) * cols + j] as number))
    ) {
      out.push({ kind: 'add', text: b[j] as string });
      j += 1;
    } else {
      out.push({ kind: 'del', text: a[i] as string });
      i += 1;
    }
  }
  return out;
}

// Which section of the editor a problem belongs to, from the path the core gives it.
export type Section =
  | 'types'
  | 'fields'
  | 'layout'
  | 'states'
  | 'moves'
  | 'gates'
  | 'views'
  | 'playbook';

export function sectionOf(problem: string): Section {
  const at = problem.split(':')[0] ?? '';
  const parts = at.split('.');
  const rest = parts[0] === 'types' ? parts.slice(2) : parts;
  const head = rest[0] ?? '';
  if (parts[0] === 'types' && rest.length === 0) return 'types';
  if (head === 'fields') return 'fields';
  if (head === 'layout') return 'layout';
  if (head === 'view') return 'views';
  if (head === 'playbook') return 'playbook';
  if (head.startsWith('children') || head === 'root' || head === 'label' || head === 'icon')
    return 'types';
  if (head === 'workflow') {
    const part = rest[1] ?? '';
    if (part.startsWith('transitions')) return 'moves';
    if (part.startsWith('gates')) return 'gates';
    return 'states';
  }
  return parts[0] === 'types' ? 'types' : 'fields';
}
