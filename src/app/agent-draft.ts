import { readFileSync } from 'node:fs';
import type { Channel } from '../core/authority.ts';
import {
  type BoardDefinition,
  clone,
  isEvidence,
  type Part,
  type Step,
} from '../core/board/model.ts';
import type { Problem } from '../core/board/problems.ts';
import { parseDefinition } from '../core/board/schema.ts';
import { boardLang, type Lang } from '../core/board/templates.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { DEFAULT_LEASE_TTL_MS, leaseExpiry } from '../core/lease.ts';
import { findDraft, listBoards } from '../store/boards.ts';
import { transaction } from '../store/database.ts';
import { appendEvent, type EvidenceRecord, findEvidence, takeLease } from '../store/queries.ts';
import {
  type BoardRecord,
  boardProblems,
  ensureRequestsBoard,
  getBoardRecord,
  insertNewBoard,
  saveDraft,
} from './boards.ts';
import { BOARD_JSON_SCHEMA, DRAFT_FILENAME } from './draft-request.ts';
import { evidenceFile, placeFile, recordEvidence } from './evidence.ts';
import { insertNewItem, requireItem, systemClock } from './items.ts';
import { liveBoardOf } from './next.ts';
import type { Project } from './project.ts';

// "Que lo esboce un agente": the person asks on a Pedido (their words its field; how to hand the
// draft in, its step's instructions: draft-request.ts), the board waits as a draft, the agent
// hands in a board.json on that Pedido (checked as a board, kept as evidence), and the person
// merges it into the draft, which says what the agent added.

// The module the draft is kept under on the Pedido.
export const DRAFT_MODULE = 'files';

const TITLE: Readonly<Record<Lang, (name: string) => string>> = {
  en: (name) => `Draft the board ${name}`,
  es: (name) => `Esbozar el tablero ${name}`,
};

export type AgentDraftRequest = { name: string; need: string; agent: string | null; lang: Lang };

// Creates the Pedido (assigned to the agent when one is named: it holds the item) and the board,
// waiting on it.
export function requestAgentDraft(
  project: Project,
  input: AgentDraftRequest,
  now = systemClock,
): { board: BoardRecord; item: string } {
  ensureRequestsBoard(project, input.lang, now);
  return transaction(project.db, () => {
    const requests = listBoards(project.db).find(({ builtin }) => builtin);
    const collection = requests?.collection;
    const live = collection ? liveBoardOf(project, collection) : undefined;
    if (!collection || !live) throw new OteaError('not_found', 'The project has no Pedidos board');
    const first = live.def.form[0]?.ref;
    const at = now();
    const need = input.need.trim();
    if (need === '') throw new OteaError('missing_fields', 'Say what the board is for');
    const { item } = insertNewItem(
      project,
      {
        collection,
        title: TITLE[input.lang](input.name.trim()),
        fields: first ? { [first]: need } : {},
        actor: { kind: 'human', name: 'human' },
        channel: 'ui',
      },
      at,
    );
    if (input.agent) {
      const lease = { holder: input.agent, expiresAt: leaseExpiry(at, DEFAULT_LEASE_TTL_MS) };
      takeLease(project.db, item.id, lease, at);
      appendEvent(project.db, {
        itemId: item.id,
        type: 'claimed',
        actor: { kind: 'human', name: 'human' },
        at,
        data: { ...lease, cause: 'assigned' },
      });
    }
    const board = insertNewBoard(
      project,
      { name: input.name, lang: input.lang, requestItem: item.id },
      now,
    );
    return { board, item: item.id };
  });
}

// The board waiting on a Pedido, when there is one.
export function waitingDraftOf(project: Project, pedido: string): BoardRecord | undefined {
  const row = listBoards(project.db).find(
    ({ id }) => findDraft(project.db, id)?.requestItem === pedido,
  );
  return row ? getBoardRecord(project, row.id) : undefined;
}

function requireWaiting(project: Project, pedido: string): BoardRecord {
  requireItem(project.db, pedido);
  const board = waitingDraftOf(project, pedido);
  if (!board?.draft) throw new OteaError('not_found', `No board waits for a draft on ${pedido}`);
  return board;
}

// The draft an agent starts from: the board as it stands.
export function draftToStartFrom(project: Project, pedido: string): BoardDefinition {
  const board = requireWaiting(project, pedido);
  if (!board.draft) throw new OteaError('not_found', `No board waits for a draft on ${pedido}`);
  return board.draft.definition;
}

// A problem of the board in English, for the agent that drafted it.
export function problemWords(problem: Problem): string {
  const quoted = (key: string) => {
    const value = problem.params[key];
    return typeof value === 'string' ? ` "${value}"` : '';
  };
  const [step, name, agent] = [quoted('step'), quoted('name'), quoted('agent')];
  const [part, board, other] = [quoted('part'), quoted('board'), quoted('other')];
  const words: Record<Problem['code'], string> = {
    board_unnamed: 'the board has no name',
    board_name_taken: `another board is called${name}`,
    no_steps: 'the board has no steps',
    step_unnamed: 'a step has no name',
    part_unnamed: 'a field or piece of evidence has no name',
    duplicate_name: `two things are called${name}`,
    part_missing: 'a step or the form names a part the board does not have',
    reserved_name: `${name.trim() || 'a name'} is a word Otea uses for itself`,
    when_unreadable: 'a "required only when" reads a part that is not a choice',
    way_invalid: `a way out of step${step} leads to itself or to a step the board does not have`,
    back_invalid: `step${step} sends work back to a later step`,
    cap_invalid: 'the cap on new items is not a whole number above zero',
    agent_offline: `agent${agent} has never connected`,
    self_review: `step${step} has the same agent doing and reviewing it`,
    agent_closes: `step${step} would let an agent close the item: only the person says Done`,
    wait_no_split: `step${step} waits for its parts, but${board} divides into nothing`,
    skip_invalid: `step${step} starts new items past it, which only a first step nobody reviews may do`,
    split_cycle: `${board.trim() || 'the board'} and${other} divide into each other`,
    split_unknown: `${board.trim() || 'the board'} divides into a board that does not exist`,
    guard_no_push: `the branch${part} is protected but no step lets it be pushed`,
    guard_base: `the base branch the branch${part} protects too is not a branch name`,
    initial_invalid: `the field${part} starts with a value it does not have`,
    motive_agent_drop: `an agent that drops in step${step} must name a motive`,
  };
  return `${problem.level}: ${words[problem.code]}`;
}

const SHOWN_PROBLEMS = 12;

// A board.json of the wrong shape, for the agent that wrote it: what is wrong, one line each, then
// where to start from, the published shape, and Studio, where the person can finish it.
function notABoard(pedido: string, problems: readonly string[]): string {
  const more = problems.length - SHOWN_PROBLEMS;
  return [
    'The file is not a board:',
    ...problems.slice(0, SHOWN_PROBLEMS).map((problem) => `  ${problem}`),
    ...(more > 0 ? [`  and ${more} more`] : []),
    `Start from what otea board draft ${pedido} prints: it has every key a board takes. Each key, with what it is for and an example, is in ${BOARD_JSON_SCHEMA}. A board you cannot get right in JSON, the person can finish in Studio.`,
  ].join('\n');
}

export type SubmitInput = { id: string; text: string; actor: Actor; channel: Channel };

export type Submitted = { board: string; evidence: EvidenceRecord; problems: string[] };

// The agent hands in its draft: it must read as a board; then it is kept on the Pedido as
// board.json and merged by id into the board's draft at once (handing it in is the agent's
// handoff of the draft: Studio's home sees it arrive and opens it with what the agent added), and
// what is still wrong with it (problems the person sees in Studio) comes back.
export function submitAgentDraft(
  project: Project,
  input: SubmitInput,
  now = systemClock,
): Submitted {
  const board = requireWaiting(project, input.id);
  let raw: unknown;
  try {
    raw = JSON.parse(input.text);
  } catch {
    throw new OteaError('invalid_board', `${DRAFT_FILENAME} is not JSON`);
  }
  const reading = parseDefinition(raw);
  if (!reading.ok) throw new OteaError('invalid_board', notABoard(input.id, reading.problems));
  const problems = boardProblems(project, board.id, reading.definition).map(problemWords);
  const evidence = transaction(project.db, () => {
    const item = requireItem(project.db, input.id);
    const at = now();
    const file = { filename: DRAFT_FILENAME, bytes: Buffer.from(input.text, 'utf8') };
    // The Pedido's page has no module for it: it is kept under files, found by its name.
    const placed = { ...placeFile(project, item, file, input.actor, at), module: DRAFT_MODULE };
    return recordEvidence(project, item.id, placed, input, at);
  });
  mergeAgentDraft(project, board.id, evidence.id, now);
  return { board: board.id, evidence, problems };
}

type Words = {
  step: string;
  gone: string;
  evidence: string;
  field: string;
  instructions: string;
  changed: string;
  item: string;
  about: string;
  idle: string;
};

const NOTE_WORDS: Readonly<Record<Lang, Words>> = {
  en: {
    step: '+ step',
    gone: '− step',
    evidence: '+ evidence',
    field: '+ field',
    instructions: 'instructions in',
    changed: 'changes in',
    item: 'item:',
    about: 'About this board',
    idle: 'When there is nothing to do',
  },
  es: {
    step: '+ paso',
    gone: '− paso',
    evidence: '+ evidencia',
    field: '+ campo',
    instructions: 'instrucciones en',
    changed: 'cambios en',
    item: 'ítem:',
    about: 'Sobre este tablero',
    idle: 'Cuando no hay nada que hacer',
  },
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The agent's board is what it was asked for, whole: its steps (in its order) replace the draft's,
// so a step it left out is gone; its item, form, instructions and texts are taken as they are.
// Only the name stays the person's. Parts are kept from both, so a step put back finds its own.
// The note says what changed, removals included.
export function mergeDefinitions(
  draft: BoardDefinition,
  agent: BoardDefinition,
): { definition: BoardDefinition; note: string[] } {
  const words = NOTE_WORDS[boardLang(draft)];
  const out: BoardDefinition = {
    ...clone(agent),
    name: draft.name,
    parts: { ...clone(draft.parts), ...clone(agent.parts) },
    layout: { ...draft.layout, ...agent.layout },
  };
  const added: Part[] = Object.values(agent.parts).filter((part) => !draft.parts[part.id]);
  const before = new Map(draft.steps.map((step) => [step.id, step]));
  const fresh = agent.steps.filter(({ id }) => !before.has(id));
  const gone = draft.steps.filter(({ id }) => !agent.steps.some((step) => step.id === id));
  const changes = agent.steps.flatMap((step) => {
    const was = before.get(step.id);
    if (!was || same(was, step)) return [];
    const onlyInstructions = same({ ...was, instructions: null }, { ...step, instructions: null });
    return [`${onlyInstructions ? words.instructions : words.changed} ${step.name}`];
  });
  const note = [
    ...fresh.map((step) => `${words.step} ${step.name}`),
    ...gone.map((step) => `${words.gone} ${step.name}`),
    ...added.map((part) => `${isEvidence(part) ? words.evidence : words.field} ${part.name}`),
    ...changes,
    ...(agent.item !== draft.item ? [`${words.item} ${agent.item}`] : []),
    ...(agent.about !== draft.about ? [`${words.changed} ${words.about}`] : []),
    ...(agent.idle !== draft.idle ? [`${words.changed} ${words.idle}`] : []),
  ];
  return { definition: out, note };
}

// Reads the agent's board.json (evidence on the board's Pedido) into the draft, with what it added.
export function mergeAgentDraft(
  project: Project,
  boardId: string,
  evidenceId: number,
  now = systemClock,
): BoardRecord {
  const record = getBoardRecord(project, boardId);
  const draft = record.draft;
  const evidence = findEvidence(project.db, evidenceId);
  if (!draft?.requestItem || !evidence || evidence.itemId !== draft.requestItem)
    throw new OteaError(
      'not_found',
      `Evidence ${evidenceId} is not a draft handed in for this board`,
    );
  let text: string;
  try {
    text = readFileSync(evidenceFile(project.dataDir, evidence.sha256), 'utf8');
  } catch {
    throw new OteaError('not_found', `The file of evidence ${evidenceId} is missing`);
  }
  const reading = parseDefinition(JSON.parse(text));
  if (!reading.ok)
    throw new OteaError('invalid_board', `The file is not a board: ${reading.problems.join('; ')}`);
  const { definition, note } = mergeDefinitions(draft.definition, reading.definition);
  const saved = saveDraft(
    project,
    boardId,
    { definition, baseVersion: draft.baseVersion },
    now,
    note,
  );
  return saved.record;
}
