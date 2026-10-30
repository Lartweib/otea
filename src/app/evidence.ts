import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Channel } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import {
  type EvidenceRole,
  evidenceTypeOf,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_MB,
} from '../core/evidence.ts';
import type { Actor } from '../core/item.ts';
import { activeLease, assertMayWrite } from '../core/lease.ts';
import { turnOf } from '../core/workflow.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  type EvidenceRecord,
  findEvidence,
  insertEvidence,
} from '../store/queries.ts';
import { requireItem, systemClock, workflowOf } from './items.ts';
import { oteaDir, type Project } from './project.ts';

// Files are stored once under .otea/evidence, named by their sha256, so attaching the same file
// again, to any item, stores nothing new.
export function evidenceDir(root: string): string {
  return join(oteaDir(root), 'evidence');
}

export function evidenceFile(root: string, sha256: string): string {
  return join(evidenceDir(root), sha256);
}

// `path` is absolute: the CLI and the MCP tool resolve it against their working directory.
export type AttachInput = {
  id: string;
  path: string;
  role?: EvidenceRole;
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
function store(root: string, sha256: string, bytes: Buffer): void {
  const target = evidenceFile(root, sha256);
  if (existsSync(target)) return;
  mkdirSync(evidenceDir(root), { recursive: true });
  const partial = `${target}.${randomUUID()}.partial`;
  writeFileSync(partial, bytes);
  renameSync(partial, target);
}

// Evidence is append-only, like the event log. It obeys the rules of an update: another agent's
// lease and a closed item refuse it, and a refusal stores nothing.
export function attachEvidence(
  project: Project,
  input: AttachInput,
  now = systemClock,
): EvidenceRecord {
  const bytes = readEvidence(input.path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const filename = basename(input.path);
  const { kind, contentType } = evidenceTypeOf(filename);
  const caption = input.caption?.trim() || null;
  const { db } = project;
  return transaction(db, () => {
    const item = requireItem(db, input.id);
    const workflow = workflowOf(project, item);
    const at = now();
    const { actor, channel, role = 'single' } = input;
    assertMayWrite(item.id, activeLease(item.lease, at), actor);
    if (turnOf(workflow, item.state) === 'none') {
      throw new OteaError(
        'item_closed',
        `${item.id} is ${item.state} (turn none) and can no longer take evidence`,
      );
    }
    store(project.root, sha256, bytes);
    const entry = {
      itemId: item.id,
      role,
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
    const id = insertEvidence(db, entry);
    const data = { evidenceId: id, role, kind, filename, ...(caption ? { caption } : {}), channel };
    appendEvent(db, { itemId: item.id, type: 'evidence_added', actor, at, data });
    return { id, ...entry };
  });
}

const EVIDENCE_ID = /^[1-9][0-9]*$/;

// The entry and where its file is stored; not_found when either is missing.
export function evidenceToServe(
  project: Project,
  id: string,
): { evidence: EvidenceRecord; path: string } {
  const evidence = EVIDENCE_ID.test(id) ? findEvidence(project.db, Number(id)) : undefined;
  const path = evidence && evidenceFile(project.root, evidence.sha256);
  if (!evidence || !path || !existsSync(path)) {
    throw new OteaError('not_found', `Evidence "${id}" not found`);
  }
  return { evidence, path };
}
