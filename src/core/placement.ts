import { OteaError } from './errors.ts';
import { type EvidenceRole, evidenceTypeOf } from './evidence.ts';
import { type Layout, type LayoutEntry, type LayoutSlot, MODULE_REGISTRY } from './modules.ts';

// Where evidence modules may sit, in the order attach and show read them.
const EVIDENCE_SLOTS: readonly LayoutSlot[] = ['evidence', 'body', 'side', 'phone'];

// An evidence module as a layout places it: always with its id.
export type EvidenceModuleEntry = LayoutEntry & { id: string };

export function evidenceModules(layout: Layout): EvidenceModuleEntry[] {
  return EVIDENCE_SLOTS.flatMap((slot) =>
    layout[slot].filter(
      (entry): entry is EvidenceModuleEntry =>
        MODULE_REGISTRY[entry.module].family === 'evidence' && entry.id !== undefined,
    ),
  );
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

// What a module takes: its `accepts` (kinds or extensions), or every kind its family draws.
function takes(entry: LayoutEntry): readonly string[] {
  return entry.accepts ?? MODULE_REGISTRY[entry.module].accepts ?? [];
}

export function moduleAccepts(entry: LayoutEntry, filename: string): boolean {
  const { kind } = evidenceTypeOf(filename);
  if (kind === 'file') return false;
  const accepted = takes(entry);
  return accepted.includes(kind) || accepted.includes(extensionOf(filename));
}

function named(entry: EvidenceModuleEntry): string {
  const variant = entry.variant === undefined ? '' : `, ${entry.variant}`;
  return `"${entry.id}" (${entry.module}${variant})`;
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
  { filename, module }: AttachRequest,
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
        `${named(found)} takes ${takes(found).join(', ')}, not ${filename}`,
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
    );
  }
  if (more.length > 0) {
    const options = fitting.map(({ id }) => `--module ${id}`).join(' or ');
    throw new OteaError(
      'module_required',
      `${filename} fits more than one evidence module of ${target.id} (${target.type}): pass ${options}`,
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
// modules, or after a preset edit). null when no module accepts it.
export function holderOf(layout: Layout, evidence: Placed): string | null {
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

export function groupEvidence<T extends Placed>(layout: Layout, evidence: T[]): EvidenceGroups<T> {
  const modules = evidenceModules(layout).map((module) => ({ module, evidence: [] as T[] }));
  const others: T[] = [];
  for (const entry of evidence) {
    const holder = holderOf(layout, entry);
    const group = modules.find(({ module }) => module.id === holder);
    if (group) group.evidence.push(entry);
    else others.push(entry);
  }
  return { modules, others };
}
