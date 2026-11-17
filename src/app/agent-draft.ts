import { readFileSync } from 'node:fs';
import type { Channel } from '../core/authority.ts';
import { isClosed, positionOf, stateOf } from '../core/board/engine.ts';
import {
  type BoardDefinition,
  clone,
  isEvidence,
  type Part,
  type Step,
  usedRefs,
} from '../core/board/model.ts';
import type { Problem } from '../core/board/problems.ts';
import { parseDefinition } from '../core/board/schema.ts';
import { boardLang, isSetKey, type Lang } from '../core/board/templates.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { leaseExpiry } from '../core/lease.ts';
import { findDraft, listBoards } from '../store/boards.ts';
import { transaction } from '../store/database.ts';
import {
  appendEvent,
  clearLease,
  type EvidenceRecord,
  findEvidence,
  type ItemRecord,
  takeLease,
  updateItemState,
} from '../store/queries.ts';
import {
  type BoardRecord,
  boardProblems,
  ensureRequestsBoard,
  getBoardRecord,
  insertNewBoard,
  insertNewBoardSet,
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

// The drafting agent holds the Pedido for the whole conversation with the person, which can run
// far longer than a step's lease: a draft not handed in yet is no stuck work (ONB3-3).
export const DRAFT_LEASE_TTL_MS = 24 * 60 * 60_000;

const HANDED_IN: Readonly<Record<Lang, (name: string) => string>> = {
  en: (name) => `The draft of ${name} is in: try it in Studio and publish it`,
  es: (name) => `El esbozo de ${name} está listo: pruébalo en Studio y publícalo`,
};

const TITLE: Readonly<Record<Lang, (name: string) => string>> = {
  en: (name) => `Draft the board ${name}`,
  es: (name) => `Esbozar el tablero ${name}`,
};

// `by`: who asks for it, the person in Studio unless said otherwise (an agent the person asked for
// a board: otea board draft --new).
export type AgentDraftRequest = {
  name: string;
  need: string;
  agent: string | null;
  lang: Lang;
  by?: { actor: Actor; channel: Channel };
  // A catalogue template the draft starts from: one board, or a set, whose first board it is.
  template?: string;
};

const PERSON = { actor: { kind: 'human', name: 'human' }, channel: 'ui' } as const;

// Creates the Pedido (assigned to the agent when one is named: it holds the item) and the board,
// waiting on it.
export function requestAgentDraft(
  project: Project,
  input: AgentDraftRequest,
  now = systemClock,
): { board: BoardRecord; item: string; others: BoardRecord[] } {
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
    const { actor, channel } = input.by ?? PERSON;
    const { item } = insertNewItem(
      project,
      {
        collection,
        title: TITLE[input.lang](input.name.trim()),
        fields: first ? { [first]: need } : {},
        actor,
        channel,
      },
      at,
    );
    if (input.agent) {
      const lease = { holder: input.agent, expiresAt: leaseExpiry(at, DRAFT_LEASE_TTL_MS) };
      takeLease(project.db, item.id, lease, at);
      appendEvent(project.db, {
        itemId: item.id,
        type: 'claimed',
        actor,
        at,
        data: { ...lease, cause: 'assigned' },
      });
    }
    if (input.template !== undefined && isSetKey(input.template)) {
      // A set's boards are drafted together: the first waits on the Pedido, named as asked, and
      // the others come with it under the template's names, for the person to publish as one.
      const [board, ...others] = insertNewBoardSet(
        project,
        {
          set: input.template,
          lang: input.lang,
          boards: [{ name: input.name }],
          requestItem: item.id,
        },
        now,
      );
      if (!board) throw new OteaError('not_found', `There is no template ${input.template}`);
      return { board, item: item.id, others };
    }
    const board = insertNewBoard(
      project,
      {
        name: input.name,
        lang: input.lang,
        requestItem: item.id,
        ...(input.template === undefined ? {} : { template: input.template }),
      },
      now,
    );
    return { board, item: item.id, others: [] };
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

const closeWords = (close: unknown) =>
  Array.isArray(close) && close.length > 0 ? ` (did you mean ${close.join(', ')}?)` : '';

// A problem of the board in English, for the agent that drafted it.
export function problemWords(problem: Problem): string {
  const quoted = (key: string) => {
    const value = problem.params[key];
    return typeof value === 'string' ? ` "${value}"` : '';
  };
  const [step, name] = [quoted('step'), quoted('name')];
  const [part, board, other] = [quoted('part'), quoted('board'), quoted('other')];
  const words: Record<Problem['code'], string> = {
    board_unnamed: 'the board has no name',
    board_name_taken: `another board is called${name}`,
    icon_unknown: `the icon${quoted('icon')} is not one Otea draws${closeWords(problem.params.close)}; the icons are listed in ${BOARD_JSON_SCHEMA}`,
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
    self_review: `step${step} has the person doing and reviewing it`,
    agent_closes: `step${step} would let an agent close the item: only the person says Done (an agent may close it only in a last step every way into it comes from a step the person closes)`,
    wait_no_split: `step${step} waits for its parts, but${board} divides into nothing`,
    skip_invalid: `step${step} starts new items past it, which only a first step nobody reviews may do`,
    split_cycle: `${board.trim() || 'the board'} and${other} divide into each other`,
    split_unknown: `${board.trim() || 'the board'} divides into a board that does not exist`,
    guard_no_push: `the branch${part} is protected but no step lets it be pushed`,
    guard_base: `the base branch the branch${part} protects too is not a branch name`,
    initial_invalid: `the field${part} starts with a value it does not have`,
    mention_raw: `step${step} mentions something as @{…}: write it @[id], the id of the step or part`,
    mention_unknown: `step${step} mentions an @[id] the board does not have`,
    analysis_missing: `the analysis role${quoted('role')} names a field the board does not use`,
    analysis_kind: `the analysis role${quoted('role')} names${part}, which it cannot read: effort, risk and impact read a level, number or choice; area a choice, several or short text; due a date`,
  };
  return `${problem.level}: ${words[problem.code]}`;
}

const SHOWN_PROBLEMS = 12;

// A board.json of the wrong shape, for the agent that wrote it: what is wrong, one line each, then
// where to start from (`start`), the published shape, and Studio, where the person can finish it.
function notABoard(start: string, problems: readonly string[]): string {
  const more = problems.length - SHOWN_PROBLEMS;
  return [
    'The file is not a board:',
    ...problems.slice(0, SHOWN_PROBLEMS).map((problem) => `  ${problem}`),
    ...(more > 0 ? [`  and ${more} more`] : []),
    `${start}: it has every key a board takes. Each key, with what it is for and an example, is in ${BOARD_JSON_SCHEMA}. A board you cannot get right in JSON, the person can finish in Studio.`,
  ].join('\n');
}

// The agent's board.json read as a board, or what is wrong with it; `start`: where to start from.
function readDraftFile(text: string, start: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new OteaError('invalid_board', `${DRAFT_FILENAME} is not JSON`);
  }
  const reading = parseDefinition(raw);
  if (!reading.ok) throw new OteaError('invalid_board', notABoard(start, reading.problems));
  return reading;
}

// The parts a draft defines but places nowhere (form, a step's handoff, anytime): no item would
// get them, and Studio does not show them on the board, so the agent is told, by their names.
function unplacedNote(def: BoardDefinition): string[] {
  const used = usedRefs(def);
  const names = Object.values(def.parts)
    .filter(({ id }) => !used.has(id))
    .map(({ name }) => name);
  if (names.length === 0) return [];
  const listed =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return [
    `parts: ${listed} ${names.length === 1 ? 'is' : 'are'} on no form, handoff or anytime, so no item gets ${names.length === 1 ? 'it' : 'them'}: place each, or remove it [parts]`,
  ];
}

const nameNote = (kept: string, file: string) =>
  `name: the board keeps the name "${kept}" it was asked for; the file's ${file.trim() ? `"${file.trim()}"` : 'empty name'} is not used [name]`;

export type SubmitInput = { id: string; text: string; actor: Actor; channel: Channel };

// `notes`: what reading it as today's board changed (a step that named one agent is any agent's).
export type Submitted = {
  board: string;
  evidence: EvidenceRecord;
  problems: string[];
  notes: string[];
};

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
  const reading = readDraftFile(input.text, `Start from what otea board draft ${input.id} prints`);
  // The name is the person's (the one asked for, or since given in Studio): the file is checked
  // under it, so a name the file left empty or took from another board is no problem, and is said.
  const name = board.draft?.definition.name ?? reading.definition.name;
  const kept =
    reading.definition.name.trim() === name.trim() ? [] : [nameNote(name, reading.definition.name)];
  const checked = { ...reading.definition, name };
  const problems = boardProblems(project, board.id, checked).map(problemWords);
  const evidence = transaction(project.db, () => {
    const item = requireItem(project.db, input.id);
    const at = now();
    const file = { filename: DRAFT_FILENAME, bytes: Buffer.from(input.text, 'utf8') };
    // The Pedido's page has no module for it: it is kept under files, found by its name.
    const placed = { ...placeFile(project, item, file, input.actor, at), module: DRAFT_MODULE };
    const recorded = recordEvidence(project, item.id, placed, input, at);
    waitForPerson(project, item, name, input, at);
    return recorded;
  });
  mergeAgentDraft(project, board.id, evidence.id, now);
  return {
    board: board.id,
    evidence,
    problems,
    notes: [...kept, ...(reading.notes ?? []), ...unplacedNote(checked)],
  };
}

// Handing the draft in is the agent's handoff: the Pedido goes to the person's review of its step
// (trying the board and publishing it, which closes the Pedido), and the agent's lease goes with
// the work it ended. Handed in again from there, it stays where it waits.
function waitForPerson(
  project: Project,
  item: ItemRecord,
  name: string,
  input: SubmitInput,
  at: string,
): void {
  const position = positionOf(item.state);
  if (isClosed(position) || position.phase !== 'doing') return;
  const live = liveBoardOf(project, item.collection);
  const step = live?.def.steps.find(({ id }) => id === position.step);
  if (!live || !step || step.reviewer !== 'you') return;
  const to = stateOf({ step: step.id, phase: 'review' });
  updateItemState(project.db, item.id, to, at);
  appendEvent(project.db, {
    itemId: item.id,
    type: 'transitioned',
    actor: input.actor,
    at,
    data: {
      from: item.state,
      to,
      reason: HANDED_IN[boardLang(live.def)](name.trim()),
      channel: input.channel,
    },
  });
  const held = item.lease;
  if (!held) return;
  clearLease(project.db, item.id);
  appendEvent(project.db, {
    itemId: item.id,
    type: 'released',
    actor: input.actor,
    at,
    data: { holder: held.holder, cause: 'handed_in' },
  });
}

export type ProposeInput = {
  name: string;
  need: string;
  lang: Lang;
  actor: Actor;
  channel: Channel;
  text?: string;
  template?: string;
};

// An agent the person asked for a board starts what Studio's "Que lo esboce un agente" does: the
// Pedido, held by the agent, and the board waiting on it; with a board.json, handed in at once.
// A file that is not a board makes nothing. Publishing stays the person's, in Studio.
export function proposeAgentDraft(
  project: Project,
  input: ProposeInput,
  now = systemClock,
): { board: BoardRecord; item: string; others: BoardRecord[]; submitted?: Submitted } {
  if (input.text !== undefined)
    readDraftFile(
      input.text,
      'Nothing was made. Without --file it makes the board and its Pedido; then start from what otea board draft <id> prints',
    );
  const { actor, channel } = input;
  const asked = requestAgentDraft(
    project,
    {
      name: input.name,
      need: input.need,
      agent: actor.name,
      lang: input.lang,
      by: { actor, channel },
      ...(input.template === undefined ? {} : { template: input.template }),
    },
    now,
  );
  if (input.text === undefined) return asked;
  const submitted = submitAgentDraft(
    project,
    { id: asked.item, text: input.text, actor, channel },
    now,
  );
  return { ...asked, board: getBoardRecord(project, asked.board.id), submitted };
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
  // A part placed nowhere is not on the board: Studio never says it was added.
  const placed = usedRefs(agent);
  const added: Part[] = Object.values(agent.parts).filter(
    (part) => !draft.parts[part.id] && placed.has(part.id),
  );
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
