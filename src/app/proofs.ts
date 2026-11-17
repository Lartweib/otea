import { readFileSync } from 'node:fs';
import type { Channel } from '../core/authority.ts';
import { isClosed, positionOf } from '../core/board/engine.ts';
import type { BoardDefinition, Part } from '../core/board/model.ts';
import {
  findTest,
  logLine,
  POINT_PROVED,
  type Proof,
  proofsFrom,
  testTitle,
} from '../core/board/proofs.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { activeLease, assertMayWrite } from '../core/lease.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  type EvidenceRecord,
  selectEvents,
  selectEvidence,
} from '../store/queries.ts';
import { evidenceFile } from './evidence.ts';
import { getItem, requireItem, requireWritableItem, systemClock, updateItem } from './items.ts';
import { itemOnBoard, liveBoardOf } from './next.ts';
import type { Project } from './project.ts';

export type { Proof };

// What shows a point holds: an evidence entry the item has (`evidence`, its number), a line of an
// attached log (`log`: its file name and line), or a test of an attached report (`test`).
export type ProofSource =
  | { evidence: number }
  | { log: { file: string; line: number } }
  | { test: string }
  | Record<string, never>;

export type TickInput = {
  id: string;
  point: string;
  // The checklist, by name or id, when the board has more than one.
  part?: string;
  source: ProofSource;
  actor: Actor;
  channel: Channel;
};

export type Ticked = {
  part: string;
  point: string;
  proof?: Proof;
  text: string;
};

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function checklists(def: BoardDefinition): Part[] {
  return Object.values(def.parts).filter((part) => part.kind === 'check');
}

// The checklist and the point a reader names: the point by name or id, in the checklist named or,
// when none is, in the one checklist that has it.
export function pointOf(
  def: BoardDefinition,
  point: string,
  part?: string,
): { part: Part; point: { id: string; name: string } } {
  const lists = checklists(def).filter(
    (list) => part === undefined || fold(list.name) === fold(part) || list.id === part,
  );
  if (part !== undefined && lists.length === 0)
    throw new OteaError(
      'not_found',
      `${def.name} has no checklist "${part}"; its checklists are ${
        checklists(def)
          .map(({ name }) => name)
          .join(', ') || 'none'
      }`,
    );
  const found = lists.flatMap((list) =>
    list.options
      .filter((option) => option.id === point || fold(option.name) === fold(point))
      .map((option) => ({ part: list, point: option })),
  );
  const [one, other] = found;
  if (!one)
    throw new OteaError(
      'not_found',
      `No checklist of ${def.name} has the point "${point}"; its points are ${lists
        .flatMap(({ options }) => options.map(({ name }) => `"${name}"`))
        .join(', ')}`,
    );
  if (other)
    throw new OteaError(
      'invalid_fields',
      `"${point}" is a point of ${one.part.name} and ${other.part.name}: say which with --part`,
    );
  return one;
}

function readText(project: Project, entry: EvidenceRecord): string {
  return readFileSync(evidenceFile(project.dataDir, entry.sha256), 'utf8');
}

// The evidence of the item's current round, newest first: a proof rests on what the round showed.
function roundEvidence(project: Project, id: string, since: string | undefined): EvidenceRecord[] {
  return selectEvidence(project.db, id)
    .filter((entry) => since === undefined || entry.createdAt >= since)
    .reverse();
}

// The proof the source names, verified: the evidence exists in the round, the log has that line,
// the test is in an attached report and passes.
function proofOf(
  project: Project,
  id: string,
  source: ProofSource,
  since: string | undefined,
): Omit<Proof, 'part' | 'point' | 'at' | 'by'> | undefined {
  const round = roundEvidence(project, id, since);
  if ('evidence' in source) {
    const entry = round.find(({ id: n }) => n === source.evidence);
    if (!entry)
      throw new OteaError(
        'not_found',
        `${id} has no evidence #${source.evidence} attached in this round: attach it, then tick the point`,
      );
    return { kind: 'file', evidence: entry.id, file: entry.filename };
  }
  if ('log' in source) {
    const { file, line } = source.log;
    const entry = round.find(({ filename }) => fold(filename) === fold(file));
    if (!entry)
      throw new OteaError(
        'not_found',
        `${id} has no log "${file}" attached in this round: attach it, then tick the point`,
      );
    const read = logLine(readText(project, entry), line);
    if (!read.ok)
      throw new OteaError('invalid_fields', `${file} cannot prove it at line ${line}: ${read.why}`);
    return {
      kind: 'log',
      evidence: entry.id,
      file: entry.filename,
      line,
      text: read.text,
    };
  }
  if ('test' in source) {
    for (const entry of round) {
      if (entry.size > 20 * 1024 * 1024) continue;
      const test = findTest(readText(project, entry), source.test);
      if (!test) continue;
      if (test.status !== 'passed')
        throw new OteaError(
          'invalid_fields',
          `"${testTitle(test)}" ${test.status === 'failed' ? 'fails' : 'was skipped'} in ${entry.filename}: a point is proved only by a test that passes`,
        );
      return {
        kind: 'test',
        evidence: entry.id,
        file: entry.filename,
        test: testTitle(test),
      };
    }
    throw new OteaError(
      'not_found',
      `No test report attached to ${id} in this round has a test "${source.test}": attach the JUnit XML or the vitest/jest JSON, then tick the point`,
    );
  }
  return undefined;
}

// Ticks a checklist point and, when a source is given, keeps its proof: the round's evidence is
// checked first, so a refused proof ticks nothing.
export function tickPoint(project: Project, input: TickInput, now = systemClock): Ticked {
  const item = requireWritableItem(project.db, input.id);
  const board = liveBoardOf(project, item.collection);
  if (!board)
    throw new OteaError('invalid_type', `${input.id} is not on a board: it has no checklist`);
  const { def } = board;
  const { part, point } = pointOf(def, input.point, input.part);
  const at = now();
  assertMayWrite(item.id, activeLease(item.lease, at), input.actor);
  const position = positionOf(item.state);
  if (isClosed(position))
    throw new OteaError('item_closed', `${item.id} is closed and takes no proof`, {
      kind: 'closed',
      item: item.id,
    });
  const since = itemOnBoard(project, item, def).facts.roundStartedAt;
  const proof = proofOf(project, item.id, input.source, since);
  const ticked = new Set(listOf(item.fields[part.id]));
  if (!ticked.has(point.id)) {
    const names = part.options
      .filter(({ id }) => ticked.has(id) || id === point.id)
      .map(({ name }) => name);
    updateItem(project, {
      id: item.id,
      fields: { [part.name]: names.join(', ') },
      actor: input.actor,
    });
  }
  if (!proof)
    return {
      part: part.name,
      point: point.name,
      text: `Ticked "${point.name}" in ${part.name}${part.proof ? `, without proof yet: ${part.name} asks for one` : ''}.`,
    };
  transaction(project.db, () => {
    appendEvent(project.db, {
      itemId: item.id,
      type: POINT_PROVED,
      actor: input.actor,
      at,
      data: {
        part: part.id,
        point: point.id,
        ...proof,
        channel: input.channel,
      },
    });
  });
  const kept = proofsFrom(selectEvents(project.db, item.id)).find(
    (one) => one.part === part.id && one.point === point.id,
  );
  return {
    part: part.name,
    point: point.name,
    ...(kept === undefined ? {} : { proof: kept }),
    text: `Ticked "${point.name}" in ${part.name} with ${provedBy(proof)}.`,
  };
}

function provedBy(proof: Omit<Proof, 'part' | 'point' | 'at' | 'by'>): string {
  if (proof.kind === 'log') return `${proof.file} line ${proof.line}`;
  if (proof.kind === 'test') return `the test "${proof.test}" of ${proof.file} (passes)`;
  return `${proof.file} (#${proof.evidence})`;
}

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Not JSON.
  }
  return [value];
}

// The proofs of the item's current round, for its page and its text.
export function roundProofs(project: Project, id: string): Proof[] {
  const item = getItem(project, id);
  const board = liveBoardOf(project, item.collection);
  if (!board) return [];
  return itemOnBoard(project, requireItem(project.db, id), board.def).proofs;
}
