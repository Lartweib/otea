import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Channel, Performer } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import {
  type EvidenceRole,
  evidenceTypeOf,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_MB,
} from '../core/evidence.ts';
import type { Actor } from '../core/item.ts';
import { activeLease, assertMayWrite } from '../core/lease.ts';
import type { Layout } from '../core/modules.ts';
import { holderOf, type Placement, placeEvidence } from '../core/placement.ts';
import { turnOf } from '../core/workflow.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  type EvidenceRecord,
  findEvidence,
  type ItemRecord,
  insertEvidence,
} from '../store/queries.ts';
import { typeOfItem } from './collections.ts';
import { requireItem, systemClock } from './items.ts';
import type { Project } from './project.ts';

// Files are stored once under evidence/ in the project's data folder, named by their sha256, so
// attaching the same file again, to any item, stores nothing new.
export function evidenceDir(dataDir: string): string {
  return join(dataDir, 'evidence');
}

export function evidenceFile(dataDir: string, sha256: string): string {
  return join(evidenceDir(dataDir), sha256);
}

// `path` is absolute: the CLI and the MCP tool resolve it against their working directory. `module`
// is the id of the layout module the file goes to, needed only when several accept it.
export type AttachInput = {
  id: string;
  path: string;
  role?: EvidenceRole;
  module?: string;
  caption?: string;
  actor: Actor;
  channel: Channel;
};

function readEvidence(path: string): Buffer {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats) throw new OteaError('file_not_found', `File "${path}" not found`);
  if (!stats.isFile()) throw new OteaError('file_not_found', `"${path}" is not a file`);
  if (stats.size > MAX_EVIDENCE_BYTES) {
    throw new OteaError(
      'evidence_too_large',
      `${basename(path)} is over the ${MAX_EVIDENCE_MB} MB evidence limit`,
    );
  }
  return readFileSync(path);
}

// Written aside and renamed into place, so a reader never sees a partial file.
function store(dataDir: string, sha256: string, bytes: Buffer): void {
  const target = evidenceFile(dataDir, sha256);
  if (existsSync(target)) return;
  mkdirSync(evidenceDir(dataDir), { recursive: true });
  const partial = `${target}.${randomUUID()}.partial`;
  writeFileSync(partial, bytes);
  renameSync(partial, target);
}

// A file already read: its name (a base name, as attached) and its bytes. The CLI and the MCP tool
// read it from a path (attachEvidence); the web UI sends it with a new item.
export type EvidenceFile = {
  filename: string;
  bytes: Buffer;
  role?: EvidenceRole;
  module?: string;
  caption?: string;
};

// Where a file will go, checked before anything is stored.
export type PlacedFile = Omit<EvidenceFile, 'role' | 'module'> & Placement;

// Evidence obeys the rules of an update: another agent's lease and a closed item refuse it. It goes
// to a module of the item's layout that accepts it, in a role that module takes (see placeEvidence).
export function placeFile(
  project: Project,
  item: ItemRecord,
  file: EvidenceFile,
  actor: Actor,
  at: string,
): PlacedFile {
  if (file.bytes.length > MAX_EVIDENCE_BYTES) {
    throw new OteaError(
      'evidence_too_large',
      `${file.filename} is over the ${MAX_EVIDENCE_MB} MB evidence limit`,
    );
  }
  const type = typeOfItem(project, item);
  assertMayWrite(item.id, activeLease(item.lease, at), actor);
  if (turnOf(type.workflow, item.state) === 'none') {
    throw new OteaError(
      'item_closed',
      `${item.id} is ${item.state} (turn none) and can no longer take evidence`,
    );
  }
  const request = {
    filename: file.filename,
    ...(file.role === undefined ? {} : { role: file.role }),
    ...(file.module === undefined ? {} : { module: file.module }),
  };
  const { filename, bytes, caption } = file;
  const placement = placeEvidence(type.layout, { id: item.id, type: type.name }, request);
  return { filename, bytes, ...(caption === undefined ? {} : { caption }), ...placement };
}

// Evidence is append-only, like the event log: the file is stored once, then its entry and its
// evidence_added event are written, inside the caller's transaction.
export function recordEvidence(
  project: Project,
  itemId: string,
  file: PlacedFile,
  { actor, channel }: Performer,
  at: string,
): EvidenceRecord {
  const { filename, bytes, module, role } = file;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const { kind, contentType } = evidenceTypeOf(filename);
  const caption = file.caption?.trim() || null;
  store(project.dataDir, sha256, bytes);
  const entry = {
    itemId,
    role,
    module,
    kind,
    filename,
    contentType,
    size: bytes.length,
    sha256,
    caption,
    createdAt: at,
    actor,
    channel,
  };
  const id = insertEvidence(project.db, entry);
  const data = {
    evidenceId: id,
    role,
    ...(module === null ? {} : { module }),
    kind,
    filename,
    ...(caption ? { caption } : {}),
    channel,
  };
  appendEvent(project.db, { itemId, type: 'evidence_added', actor, at, data });
  return { id, ...entry };
}

// Attaches the file at a path. A refusal stores nothing.
export function attachEvidence(
  project: Project,
  input: AttachInput,
  now = systemClock,
): EvidenceRecord {
  const file: EvidenceFile = {
    filename: basename(input.path),
    bytes: readEvidence(input.path),
    ...(input.role === undefined ? {} : { role: input.role }),
    ...(input.module === undefined ? {} : { module: input.module }),
    ...(input.caption === undefined ? {} : { caption: input.caption }),
  };
  return transaction(project.db, () => {
    const item = requireItem(project.db, input.id);
    const at = now();
    const placed = placeFile(project, item, file, input.actor, at);
    return recordEvidence(project, item.id, placed, input, at);
  });
}

// Each entry with the module that draws it in this layout (see holderOf), for readers.
export function presentEvidence(layout: Layout, evidence: EvidenceRecord[]): EvidenceRecord[] {
  return evidence.map((entry) => ({ ...entry, module: holderOf(layout, entry) }));
}

const EVIDENCE_ID = /^[1-9][0-9]*$/;

// The entry and where its file is stored; not_found when either is missing.
export function evidenceToServe(
  project: Project,
  id: string,
): { evidence: EvidenceRecord; path: string } {
  const evidence = EVIDENCE_ID.test(id) ? findEvidence(project.db, Number(id)) : undefined;
  const path = evidence && evidenceFile(project.dataDir, evidence.sha256);
  if (!evidence || !path || !existsSync(path)) {
    throw new OteaError('not_found', `Evidence "${id}" not found`);
  }
  return { evidence, path };
}
