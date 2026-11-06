import { type PlainKey, t } from './i18n/i18n.ts';
import type { Evidence, LayoutEntry, LayoutSlot, TypeView } from './types.ts';

// The slots of the detail that draw evidence modules. The phone slot is not drawn differently yet, so
// what a module placed only there holds goes to the plain list with the other leftovers.
const DRAWN: readonly LayoutSlot[] = ['evidence', 'body', 'side'];

const EVIDENCE_MODULES: readonly string[] = ['images', 'recording', 'diff', 'log', 'diagram'];

export function isEvidenceModule(entry: LayoutEntry): boolean {
  return EVIDENCE_MODULES.includes(entry.module) && entry.id !== undefined;
}

// The evidence modules a type places in the slots given and in its sections.
export function evidenceEntries(type: TypeView, slots: readonly LayoutSlot[]): LayoutEntry[] {
  const sectioned = (type.layout.sections ?? []).flatMap(({ entries }) => entries);
  return [...slots.flatMap((slot) => type.layout[slot]), ...sectioned].filter(isEvidenceModule);
}

function drawnModules(type: TypeView): string[] {
  return evidenceEntries(type, DRAWN).flatMap(({ id }) => (id === undefined ? [] : [id]));
}

// The server says which module holds each entry (the one it went to, or for older evidence the first
// that accepts it).
export function evidenceOf(evidence: readonly Evidence[], entry: LayoutEntry): Evidence[] {
  return evidence.filter(({ module }) => module !== null && module === entry.id);
}

// What no drawn module holds: every file for a type without modules (or while the type is unknown).
export function leftovers(type: TypeView | undefined, evidence: readonly Evidence[]): Evidence[] {
  const drawn = type ? drawnModules(type) : [];
  return evidence.filter(({ module }) => module === null || !drawn.includes(module));
}

export function latestFirst(evidence: readonly Evidence[]): Evidence[] {
  return [...evidence].sort((a, b) => b.id - a.id);
}

// Pairs carry no id: a compare shows the latest before beside the latest after.
export function comparePair(evidence: readonly Evidence[]): {
  before: Evidence | undefined;
  after: Evidence | undefined;
} {
  const newest = latestFirst(evidence);
  return {
    before: newest.find(({ role }) => role === 'before'),
    after: newest.find(({ role }) => role === 'after'),
  };
}

type Wording = { title: string; empty: string };

const say = (title: PlainKey, empty: PlainKey): Wording => ({ title: t(title), empty: t(empty) });

function wording({ module, variant }: LayoutEntry): Wording {
  if (module === 'images' && variant === 'compare') {
    return say('evidence.compare', 'evidence.compareEmpty');
  }
  if (module === 'images' && variant === 'gallery') {
    return say('evidence.gallery', 'evidence.galleryEmpty');
  }
  if (module === 'images') return say('evidence.image', 'evidence.imageEmpty');
  if (module === 'recording') return say('evidence.recording', 'evidence.recordingEmpty');
  if (module === 'diff') return say('evidence.diff', 'evidence.diffEmpty');
  if (module === 'diagram') return say('evidence.diagram', 'evidence.diagramEmpty');
  return say('evidence.log', 'evidence.logEmpty');
}

export function moduleTitle(entry: LayoutEntry): string {
  return entry.label ?? wording(entry).title;
}

export function emptyText(entry: LayoutEntry): string {
  return wording(entry).empty;
}

// Steps through a list of `length` and wraps at both ends.
export function stepIndex(index: number, delta: number, length: number): number {
  if (length === 0) return 0;
  return (((index + delta) % length) + length) % length;
}

// ---- diff: a unified diff, as git or diff -u write it ----

export type DiffLine =
  | { kind: 'ctx'; old: number; new: number; text: string }
  | { kind: 'del'; old: number; text: string }
  | { kind: 'add'; new: number; text: string }
  | { kind: 'note'; text: string };

export type DiffHunk = { header: string; lines: DiffLine[] };

// path: the new path, or the old one for a deleted file; '' for bare hunks.
export type DiffFile = {
  path: string;
  meta: string[];
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
};

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function pathOf(line: string): string | null {
  const raw = line.slice(4).split('\t')[0]?.trim() ?? '';
  if (raw === '/dev/null') return null;
  return raw.replace(/^[ab]\//, '');
}

function emptyFile(): DiffFile {
  return { path: '', meta: [], hunks: [], additions: 0, deletions: 0 };
}

export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let hunk: DiffHunk | undefined;
  let oldLine = 0;
  let newLine = 0;
  let oldPath: string | null = null;
  const start = () => {
    file = emptyFile();
    files.push(file);
    hunk = undefined;
    return file;
  };
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      start();
      continue;
    }
    const hunkStart = HUNK.exec(line);
    if (hunkStart) {
      const current = file ?? start();
      hunk = { header: line, lines: [] };
      current.hunks.push(hunk);
      oldLine = Number(hunkStart[1]);
      newLine = Number(hunkStart[2]);
      continue;
    }
    if (line.startsWith('--- ') && (!hunk || !file)) {
      const current = file && file.hunks.length === 0 ? file : start();
      oldPath = pathOf(line);
      current.path = oldPath ?? '';
      continue;
    }
    if (line.startsWith('+++ ') && file && !hunk) {
      file.path = pathOf(line) ?? oldPath ?? '';
      continue;
    }
    if (!hunk || !file) {
      if (file) file.meta.push(line);
      continue;
    }
    if (line.startsWith('+')) {
      hunk.lines.push({ kind: 'add', new: newLine, text: line.slice(1) });
      newLine += 1;
      file.additions += 1;
    } else if (line.startsWith('-')) {
      hunk.lines.push({ kind: 'del', old: oldLine, text: line.slice(1) });
      oldLine += 1;
      file.deletions += 1;
    } else if (line.startsWith('\\')) {
      hunk.lines.push({ kind: 'note', text: line });
    } else {
      hunk.lines.push({ kind: 'ctx', old: oldLine, new: newLine, text: line.slice(1) });
      oldLine += 1;
      newLine += 1;
    }
  }
  return files.filter((found) => found.hunks.length > 0 || found.path !== '');
}

// ---- log: numbered lines; a long one keeps its start and its end until shown in full ----

export type LogLine = { number: number; text: string };

export type LogView = { head: LogLine[]; tail: LogLine[]; hidden: number; total: number };

const KEEP = 60;

export const LONG_LOG = KEEP * 2 + 40;

export function logView(text: string, all: boolean): LogView {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const numbered = lines.map((line, index) => ({ number: index + 1, text: line }));
  const total = numbered.length;
  if (all || total <= LONG_LOG) return { head: numbered, tail: [], hidden: 0, total };
  return {
    head: numbered.slice(0, KEEP),
    tail: numbered.slice(total - KEEP),
    hidden: total - KEEP * 2,
    total,
  };
}

// ---- compare: where the divider sits, as a percentage of the width from the left ----

export function splitAt(clientX: number, left: number, width: number): number {
  if (width <= 0) return 50;
  return Math.min(100, Math.max(0, ((clientX - left) / width) * 100));
}

// Arrow keys move the divider a little, with Shift a lot; Home and End take it to an edge.
export function nudgeSplit(split: number, key: string, shift: boolean): number | undefined {
  const step = shift ? 10 : 2;
  const moved: Record<string, number> = {
    ArrowLeft: split - step,
    ArrowDown: split - step,
    ArrowRight: split + step,
    ArrowUp: split + step,
    PageDown: split - 10,
    PageUp: split + 10,
    Home: 0,
    End: 100,
  };
  const to = moved[key];
  return to === undefined ? undefined : Math.min(100, Math.max(0, to));
}
