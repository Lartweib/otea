import { OteaError } from './errors.ts';
import { type EvidenceRole, evidenceTypeOf } from './evidence.ts';
import { type Layout, type LayoutEntry, type LayoutSlot, MODULE_REGISTRY } from './modules.ts';

// Where evidence modules may sit, in the order attach and show read them.
const EVIDENCE_SLOTS: readonly LayoutSlot[] = ['evidence', 'body', 'side', 'phone'];

// An evidence module as a layout places it: always with its id.
export type EvidenceModuleEntry = LayoutEntry & { id: string };

export function evidenceModules(layout: Layout): EvidenceModuleEntry[] {
  const isModule = (entry: LayoutEntry): entry is EvidenceModuleEntry =>
    MODULE_REGISTRY[entry.module].family === 'evidence' && entry.id !== undefined;
  const sectioned = (layout.sections ?? []).flatMap(({ entries }) => entries.filter(isModule));
  return EVIDENCE_SLOTS.flatMap((slot) => [
    ...layout[slot].filter(isModule),
    ...(slot === 'body' ? sectioned : []),
  ]);
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

// The extensions a test report comes as.
const REPORTS = new Set(['xml', 'json']);

// What a module takes: its `accepts` (kinds or extensions), or every kind its family draws.
function takes(entry: LayoutEntry): readonly string[] {
  return entry.accepts ?? MODULE_REGISTRY[entry.module].accepts ?? [];
}

export function moduleAccepts(entry: LayoutEntry, filename: string): boolean {
  const { kind } = evidenceTypeOf(filename);
  const accepted = takes(entry);
  // A test run's report (JUnit XML, vitest or jest JSON) is test output: a log module takes it, and
  // reads it as its results.
  if (kind === 'file' && accepted.includes('log') && REPORTS.has(extensionOf(filename)))
    return true;
  // An opaque file goes only to a module that takes files as such (files), never one that draws.
  if (kind === 'file') return accepted.includes('file');
  return accepted.includes(kind) || accepted.includes(extensionOf(filename));
}

// A module as a reader knows it: its label (a board part's name), or its id.
function quoted(entry: EvidenceModuleEntry): string {
  return `"${entry.label ?? entry.id}"`;
}

function named(entry: EvidenceModuleEntry): string {
  const variant = entry.variant === undefined ? '' : `, ${entry.variant}`;
  return `${quoted(entry)} (${entry.module}${variant})`;
}

// A text file refused by a module that takes diffs: a diff is known by its extension alone, so a
// diff saved as .txt reads as a log (P8-R3-5). The refusal says how to name it.
function asDiff(entry: LayoutEntry, filename: string): string {
  const accepted = takes(entry);
  if (!accepted.includes('diff') || evidenceTypeOf(filename).kind !== 'log') return '';
  return `: a diff is known by its extension, so save it as ${diffName(filename)} (or .patch) and attach that`;
}

// The file's name as a .diff.
function diffName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return `${dot < 0 ? filename : filename.slice(0, dot)}.diff`;
}

// Whether a text reads as a unified diff: git's header, or a file pair followed by a hunk.
export function readsAsDiff(text: string): boolean {
  return /^diff --git \S/m.test(text) || /^--- \S.*\r?\n\+\+\+ \S.*\r?\n@@ -\d/m.test(text);
}

// A diff saved as a text file and attached without naming a part goes, by its extension, to a part
// that takes logs, though the layout has one that takes diffs (P8-R3-5): that part, to say so.
// Undefined for any other file, or when no part takes diffs.
export function diffPartFor(
  layout: Layout,
  filename: string,
  text: string,
): EvidenceModuleEntry | undefined {
  if (evidenceTypeOf(filename).kind !== 'log' || !readsAsDiff(text)) return undefined;
  return evidenceModules(layout).find((entry) => moduleAccepts(entry, diffName(filename)));
}

// What Otea says of such a diff, with the commands that put it in the diff part. `went`: the part
// it went to, when it went to one.
export function diffPartText(
  id: string,
  filename: string,
  part: EvidenceModuleEntry,
  went?: string,
): string {
  const named = (text: string) => (/^[\w.<>/-]+$/.test(text) ? text : `"${text}"`);
  const target = part.label ?? part.id;
  const where = went === undefined ? '' : `, but a .${extensionOf(filename)} goes to ${went}`;
  return `"${filename}" reads as a unified diff${where}: ${target} takes a diff saved as .diff. Save it as "${diffName(filename)}" and run otea attach ${id} ${named(diffName(filename))} --module ${named(target)}`;
}

function isCompare(entry: LayoutEntry): boolean {
  return entry.module === 'images' && entry.variant === 'compare';
}

// The item evidence goes to, for the messages of a refusal.
export type Target = { id: string; type: string };

export type AttachRequest = { filename: string; role?: EvidenceRole; module?: string };

export type Placement = { module: string | null; role: EvidenceRole };

function chosen(
  modules: EvidenceModuleEntry[],
  target: Target,
  { filename, module, role }: AttachRequest,
): EvidenceModuleEntry {
  const subject = `${target.id} (${target.type})`;
  if (module !== undefined) {
    const found = modules.find(({ id }) => id === module);
    if (!found) {
      const known =
        modules.length > 0
          ? `modules: ${modules.map(({ id }) => id).join(', ')}`
          : 'it places none';
      throw new OteaError('not_found', `${subject} has no evidence module "${module}" (${known})`);
    }
    if (!moduleAccepts(found, filename)) {
      throw new OteaError(
        'evidence_not_accepted',
        `${named(found)} takes ${takes(found).join(', ')}, not ${filename}${asDiff(found, filename)}`,
      );
    }
    return found;
  }
  const fitting = modules.filter((entry) => moduleAccepts(entry, filename));
  const [only, ...more] = fitting;
  if (!only) {
    const list = modules.map((entry) => `${named(entry)}: ${takes(entry).join(', ')}`).join('; ');
    throw new OteaError(
      'evidence_not_accepted',
      `${subject} does not take ${filename}. It takes: ${list}`,
      { kind: 'modules', modules: modules.map(({ id }) => id) },
    );
  }
  // A before or an after goes only to a compare: when one compare alone fits, the role names it.
  const compares = fitting.filter(isCompare);
  if (more.length > 0 && (role === 'before' || role === 'after') && compares.length === 1) {
    const [compare] = compares;
    if (compare) return compare;
  }
  if (more.length > 0) {
    // A board takes its evidence by name (--module "Vídeo del arreglo"), a preset by id.
    const options = fitting
      .map(({ id, label }) => `--module ${label === undefined ? id : `"${label}"`}`)
      .join(' or ');
    throw new OteaError(
      'module_required',
      `${filename} fits more than one evidence module of ${target.id} (${target.type}): pass ${options}`,
      { kind: 'modules', modules: fitting.map(({ id }) => id) },
    );
  }
  return only;
}

function fittingRole(entry: EvidenceModuleEntry, role: EvidenceRole | undefined): EvidenceRole {
  if (isCompare(entry)) {
    if (role === 'before' || role === 'after') return role;
    throw new OteaError(
      'invalid_role',
      `${named(entry)} compares a before and an after: pass --role before or --role after`,
    );
  }
  if (role === 'before' || role === 'after') {
    throw new OteaError(
      'invalid_role',
      `${named(entry)} holds single files, not a before and an after: drop --role ${role}`,
    );
  }
  return 'single';
}

// Which module of the item's layout a file goes to, and in which role. A type that places no evidence
// module takes any file, in any role, as a plain list did before layouts.
export function placeEvidence(layout: Layout, target: Target, request: AttachRequest): Placement {
  const modules = evidenceModules(layout);
  if (modules.length === 0 && request.module === undefined) {
    return { module: null, role: request.role ?? 'single' };
  }
  const entry = chosen(modules, target, request);
  return { module: entry.id, role: fittingRole(entry, request.role) };
}

export type Placed = { module: string | null; filename: string };

// The module that draws an evidence entry: the one it was attached to while the layout still places
// it and it still accepts the file, else the first module that accepts it (evidence attached before
// modules, or after a preset edit). null when no module accepts it. `keepLoose`, on a board: a file
// attached to no part (the person's, outside the parts the agents hand) stays outside them.
export function holderOf(layout: Layout, evidence: Placed, keepLoose = false): string | null {
  if (keepLoose && evidence.module === null) return null;
  const modules = evidenceModules(layout).filter((entry) =>
    moduleAccepts(entry, evidence.filename),
  );
  const recorded = modules.find(({ id }) => id === evidence.module);
  return (recorded ?? modules[0])?.id ?? null;
}

export type EvidenceGroups<T> = {
  modules: { module: EvidenceModuleEntry; evidence: T[] }[];
  others: T[];
};

export function groupEvidence<T extends Placed>(
  layout: Layout,
  evidence: T[],
  keepLoose = false,
): EvidenceGroups<T> {
  const modules = evidenceModules(layout).map((module) => ({ module, evidence: [] as T[] }));
  const others: T[] = [];
  for (const entry of evidence) {
    const holder = holderOf(layout, entry, keepLoose);
    const group = modules.find(({ module }) => module.id === holder);
    if (group) group.evidence.push(entry);
    else others.push(entry);
  }
  return { modules, others };
}
