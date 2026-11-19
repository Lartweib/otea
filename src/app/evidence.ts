import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Channel, Performer } from '../core/authority.ts';
import { gateAt, isClosed, positionOf } from '../core/board/engine.ts';
import { guardedBranch, stepById } from '../core/board/model.ts';
import { OteaError } from '../core/errors.ts';
import {
  type EvidenceRole,
  evidenceTypeOf,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_MB,
} from '../core/evidence.ts';
import type { Actor } from '../core/item.ts';
import type { Layout } from '../core/modules.ts';
import {
  evidenceModules,
  holderOf,
  moduleAccepts,
  type Placement,
  placeEvidence,
} from '../core/placement.ts';
import { turnOf } from '../core/workflow.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  type EvidenceRecord,
  findEvidence,
  type ItemRecord,
  insertEvidence,
  selectEvents,
  selectEvidence,
} from '../store/queries.ts';
import { typeOfItem } from './collections.ts';
import { requireWritableItem, systemClock } from './items.ts';
import { assertMayWriteItem } from './lease-take.ts';
import { boardModule, liveBoardOf } from './next.ts';
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
// Where a file the person attaches to a board item goes when they name no part (ONB3-4): the
// first part the board's creation form asks for that takes it, else nowhere, kept with the item
// outside the parts. The parts the steps hand are the agents' deliverables: a file of the person's
// never fills one, unless the person names it. undefined: the usual placement (an agent's file, a
// named part, an item that is not on a board).
function personsPlace(
  project: Project,
  item: ItemRecord,
  actor: Actor,
  request: { filename: string; role?: EvidenceRole; module?: string },
): Placement | undefined {
  if (actor.kind !== 'human' || request.module !== undefined) return undefined;
  const board = liveBoardOf(project, item.collection);
  if (!board) return undefined;
  const asked = new Set(board.def.form.map(({ ref }) => ref));
  const type = typeOfItem(project, item);
  const form = evidenceModules(type.layout).find(
    (entry) => asked.has(entry.id) && moduleAccepts(entry, request.filename),
  );
  if (form) {
    return placeEvidence(
      type.layout,
      { id: item.id, type: type.name },
      {
        ...request,
        module: form.id,
      },
    );
  }
  return { module: null, role: request.role ?? 'single' };
}

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
  assertMayWriteItem(project.db, item, actor, at);
  if (turnOf(type.workflow, item.state) === 'none') {
    throw new OteaError(
      'item_closed',
      `${item.id} is ${item.state} (turn none) and can no longer take evidence`,
    );
  }
  const request = {
    filename: file.filename,
    ...(file.role === undefined ? {} : { role: file.role }),
    ...(file.module === undefined
      ? {}
      : { module: boardModule(project, item.collection, file.module) }),
  };
  const { filename, bytes, caption } = file;
  const placement =
    personsPlace(project, item, actor, request) ??
    placeEvidence(type.layout, { id: item.id, type: type.name }, request);
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

// An attach that added nothing: the item already had the same file there.
export type Attached = EvidenceRecord & { duplicate?: true };

// The evidence ids attached since the item last moved (its current round).
function addedSinceMoved(project: Project, itemId: string): Set<number> {
  const events = selectEvents(project.db, itemId);
  const moved = events.findLast(({ type }) => type === 'transitioned')?.id ?? 0;
  return new Set(
    events.flatMap(({ id, type, data }) =>
      type === 'evidence_added' && id > moved ? [Number(data.evidenceId)] : [],
    ),
  );
}

// The entry the item already has for the same bytes in the same module and role, with the same
// caption, attached since it last moved: attaching it again adds nothing. Once the item moves (a
// new round), the same file is new again.
function sameSinceMoved(
  project: Project,
  itemId: string,
  file: PlacedFile,
): EvidenceRecord | undefined {
  const sha256 = createHash('sha256').update(file.bytes).digest('hex');
  const since = addedSinceMoved(project, itemId);
  return selectEvidence(project.db, itemId).findLast(
    (entry) =>
      since.has(entry.id) &&
      entry.sha256 === sha256 &&
      entry.module === file.module &&
      entry.role === file.role &&
      entry.caption === (file.caption?.trim() || null),
  );
}

// While a step that pushes the board's protected branch is reviewed, the branch is frozen: an
// agent attaches nothing, so the reviewer approves only what was handed off, never work the branch
// never got. The person may still attach.
function refuseWhileFrozen(
  project: Project,
  item: { id: string; collection: string; state: string; fields: Record<string, unknown> },
  actor: Actor,
): void {
  if (actor.kind !== 'agent') return;
  const board = liveBoardOf(project, item.collection);
  if (!board) return;
  const position = positionOf(item.state);
  if (isClosed(position) || position.phase === 'doing') return;
  if (gateAt(board.def, position, 'push').why !== 'review') return;
  const step = stepById(board.def, position.step)?.name ?? position.step;
  // An item that names no branch has none to freeze or push (P4-R2-4): only the review holds.
  const branch = guardedBranch(board.def);
  const named = branch && String(item.fields[branch.id] ?? '').trim() !== '';
  throw new OteaError(
    'invalid_transition',
    named
      ? `Not attached to ${item.id}: its branch is frozen while ${step} is reviewed, so the reviewer reads only what was handed off. Push and attach once it is sent back.`
      : `Not attached to ${item.id}: ${step} is being reviewed, so the reviewer reads only what was handed off. Attach it once it is sent back.`,
    { kind: 'frozen_in_review', item: item.id, step },
  );
}

// Attaches the file at a path. A refusal stores nothing; the same file again adds nothing.
export function attachEvidence(project: Project, input: AttachInput, now = systemClock): Attached {
  const file: EvidenceFile = {
    filename: basename(input.path),
    bytes: readEvidence(input.path),
    ...(input.role === undefined ? {} : { role: input.role }),
    ...(input.module === undefined ? {} : { module: input.module }),
    ...(input.caption === undefined ? {} : { caption: input.caption }),
  };
  return transaction(project.db, () => {
    const item = requireWritableItem(project.db, input.id);
    refuseWhileFrozen(project, item, input.actor);
    const at = now();
    const placed = placeFile(project, item, file, input.actor, at);
    const same = sameSinceMoved(project, item.id, placed);
    if (same) return { ...same, duplicate: true };
    return recordEvidence(project, item.id, placed, input, at);
  });
}

export type DetachInput = { id: string; evidence: number; actor: Actor; channel: Channel };

// Takes back a file attached by mistake (AGENTS3-4): only the one who attached it, while the item
// has not moved since, and while no note of the person or proof of a point rests on it. Evidence
// stays append-only: an evidence_detached event takes it off the item's list, and the history
// keeps both.
export function detachEvidence(
  project: Project,
  input: DetachInput,
  now = systemClock,
): EvidenceRecord {
  return transaction(project.db, () => {
    const item = requireWritableItem(project.db, input.id);
    const at = now();
    assertMayWriteItem(project.db, item, input.actor, at);
    const entry = selectEvidence(project.db, item.id).find(({ id }) => id === input.evidence);
    if (!entry) {
      throw new OteaError('not_found', `${item.id} has no attached file #${input.evidence}`);
    }
    const said = `#${entry.id} ${entry.filename}`;
    if (entry.actor.kind !== input.actor.kind || entry.actor.name !== input.actor.name) {
      throw new OteaError(
        'forbidden',
        `${said} was attached by ${entry.actor.name}: only who attached a file may detach it`,
      );
    }
    if (!addedSinceMoved(project, item.id).has(entry.id)) {
      throw new OteaError(
        'forbidden',
        `${said} went with an earlier move of ${item.id}, so it stays in the record: attach the right file instead`,
      );
    }
    const resting = selectEvents(project.db, item.id).find(
      ({ type, data }) =>
        (type === 'point_proved' && Number(data.evidence) === entry.id) ||
        (type === 'note_left' &&
          Number((data.anchor as { evidence?: unknown } | undefined)?.evidence) === entry.id),
    );
    if (resting) {
      const what = resting.type === 'note_left' ? 'a note of the person' : 'the proof of a point';
      throw new OteaError('in_use', `${said} cannot be detached: ${what} rests on it`);
    }
    appendEvent(project.db, {
      itemId: item.id,
      type: 'evidence_detached',
      actor: input.actor,
      at,
      data: {
        evidenceId: entry.id,
        filename: entry.filename,
        ...(entry.module === null ? {} : { module: entry.module }),
        channel: input.channel,
      },
    });
    return entry;
  });
}

// Each entry with the module that draws it in this layout (see holderOf), for readers.
export function presentEvidence(
  layout: Layout,
  evidence: EvidenceRecord[],
  keepLoose = false,
): EvidenceRecord[] {
  return evidence.map((entry) => ({ ...entry, module: holderOf(layout, entry, keepLoose) }));
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
