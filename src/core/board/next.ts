import { PERSON_READER } from '../item.ts';
import { timeText } from '../time.ts';
import { mappedScales, rolePart } from './analysis.ts';
import {
  backTarget,
  backWaysOf,
  type GateAction,
  gateAt,
  isClosed,
  isLandStep,
  type Linked,
  landStepOf,
  type Missing,
  NOTE_REF,
  NOTES_REF,
  type Position,
  reopenStep,
  startsWith,
  WAIT_BLOCKERS,
  WAIT_PARTS,
  waysOf,
} from './engine.ts';
import { mentionText } from './mentions.ts';
import { type Lang, LEVEL_SAID, TITLE_NAME, YES_NO_SAID } from './template-words.ts';

// The language the board was made in (reading.ts's langOf, which reads next.ts): its values are
// given to the agent in it, as the board stores and accepts them.
const boardLangOf = (def: BoardDefinition): Lang => (def.title === TITLE_NAME.es ? 'es' : 'en');

import { choiceLines, type ItemChoice } from './choices.ts';
import {
  type BoardDefinition,
  DONE,
  guardedBranch,
  type Hand,
  isEvidence,
  LEVELS,
  motiveById,
  type Part,
  partOf,
  type Step,
  stepById,
  type Target,
  usedRefs,
} from './model.ts';
import { type ItemNote, notesBlock, notesHandLine, notesRefusal } from './notes.ts';
import { answersBlock, type ItemQuestion, waitingAnswerText } from './questions.ts';

// The one writer of what an agent reads: `next`'s answer for an item at a step, the refusal of a
// handoff and the line after one. Studio's "Lo que lee el agente" calls the same functions on the
// draft, so the preview is the real text. Agents read English, as the CLI and the API speak it; the
// board's own words (names, hints, instructions) appear as the person typed them.

export const DONE_NAME = 'Done';
export const DROPPED_NAME = 'Dropped';

// The send-back that started the round being done: the reviewer's note, who sent it (`by`) and
// when, and the review it came from (that step's name and round).
// `reopened`: the round began when the closed item was reopened (`step` is the closed state's name,
// `note` the reason), not with a send-back from a review.
export type SentBack = {
  note: string;
  by: { kind: 'human' | 'agent'; name: string };
  at: string;
  step: string;
  round: number;
  reopened?: true;
};

// The note's hint when the round was sent back and the step itself asks for no note.
export const SENT_BACK_HINT = 'what you changed since it was sent back';

export type NextInput = {
  id: string;
  title: string;
  position: Position;
  round: number;
  fields: Readonly<Record<string, unknown>>;
  // How many files each evidence part holds.
  evidence: Readonly<Record<string, number>>;
  // What the handoff still lacks (handoffCheck), for the ✗ marks.
  missing: readonly Missing[];
  // The agent asking, when known.
  me?: string;
  // What the item's waits read: its parts and what blocks it (names as people read them).
  parts?: readonly Linked[];
  blockers?: readonly Linked[];
  // The board its parts are on, when the board divides (itself, for parts of the same kind).
  child?: BoardDefinition;
  // The send-back that started this round, while the step is being done.
  sentBack?: SentBack;
  // The agent holding the item's live lease, and until when.
  holder?: { name: string; expiresAt: string };
  // The agent the person left a stuck item for (Reasignar), until an agent claims or moves it.
  leftFor?: string;
  // The notes the person left in this round of the step, oldest first.
  notes?: readonly ItemNote[];
  // The questions agents asked the person in this round of the step, oldest first.
  questions?: readonly ItemQuestion[];
  // The agents that did the step in this round, none of which may review it.
  did?: readonly string[];
  // The item that planned this one, while it still stands in the step it planned it in.
  plannedBy?: { id: string; step: string };
  // The item this one is part of (its parent), with its board and the step it stands on (none once
  // closed): what it decided is the context of this one.
  parent?: { id: string; title: string; board: string; step?: string };
  // What this one implements (an Idea a task was planned from), the same way: its decision is the
  // context of this one.
  implements?: { id: string; title: string; board: string; step?: string }[];
  // The note the doer handed this round off with, for its reviewer to read.
  handed?: { note: string; by: string };
  // Once Done: that its branch was merged, and the commit when given.
  merged?: { commit?: string };
  // The option the person picked last, on an item that carries options.
  chosen?: ItemChoice;
  // A step whose work is handed in some other way than otea handoff (a board draft on its
  // Pedido): what comes after it and the command that hands it in, in place of the handoff's.
  handIn?: { after: string; command: string };
};

// Another agent's say on the item keeps the asking agent off it: a live lease it does not hold, or
// a stuck item the person left for someone else.
function heldElsewhere(input: NextInput): string | undefined {
  const { me, holder, leftFor, plannedBy } = input;
  if (me === undefined) return undefined;
  if (plannedBy)
    return `Waits for ${plannedBy.id}, which planned it, to leave ${plannedBy.step}: pick another item.`;
  if (holder && holder.name !== me)
    return `Held by ${holder.name} until ${timeText(holder.expiresAt)}: pick another item.`;
  if (!holder && leftFor !== undefined && leftFor !== me)
    return `Left for ${leftFor}: pick another item.`;
  return undefined;
}

// Whether the asking agent holds the item, and until when; or that it claims it before it starts,
// so no other agent takes it meanwhile.
function holdLine({ id, holder, me }: NextInput): string {
  if (holder && holder.name === me)
    return `You hold it until ${timeText(holder.expiresAt)}; otea heartbeat ${id} keeps it longer.`;
  if (holder) return `Held by ${holder.name} until ${timeText(holder.expiresAt)}.`;
  return `Claim it first: otea claim ${id} (otea next --claim takes and claims the next in one call).`;
}

function and(words: readonly string[], last = 'and'): string {
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} ${last} ${words.at(-1)}`;
}

export function targetName(def: BoardDefinition, target: Target): string {
  if (target === DONE) return DONE_NAME;
  return stepById(def, target)?.name ?? target;
}

// The way an agent names (`--way "Animar"`, `--way Done`), as a target of the step; undefined when
// the step has no such way.
export function wayByName(def: BoardDefinition, stepId: string, name: string): Target | undefined {
  const wanted = name.trim().toLocaleLowerCase();
  // Forward ways first, then the ways back to earlier steps (`--way "Triar"`).
  return [...waysOf(def, stepId), ...backWaysOf(def, stepId)].find((target) => {
    if (target === DONE) return ['done', 'hecho', DONE_NAME.toLowerCase()].includes(wanted);
    return target === name || targetName(def, target).trim().toLocaleLowerCase() === wanted;
  });
}

function choiceNames(part: Part, value: unknown): string {
  const ids = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string' && value.startsWith('[')
      ? (JSON.parse(value) as unknown[]).map(String)
      : String(value)
          .split(',')
          .map((piece) => piece.trim());
  return ids.map((id) => part.options.find((choice) => choice.id === id)?.name ?? id).join(', ');
}

// "IDE-1 · Pantano vivo (Ideas, Planificar): what it decided is in otea show IDE-1".
function parentLine({ id, title, board, step }: NonNullable<NextInput['parent']>): string {
  const where = step ? `${board}, ${step}` : board;
  return `${id} · ${title} (${where}): what it decided is in otea show ${id}`;
}

function isEmpty(part: Part, input: NextInput): boolean {
  if (isEvidence(part)) return (input.evidence[part.id] ?? 0) === 0;
  const value = part.id === 'title' ? input.title : input.fields[part.id];
  if (value === undefined || value === null) return true;
  return Array.isArray(value) ? value.length === 0 : String(value).trim() === '';
}

function valueText(part: Part, input: NextInput): string {
  if (isEvidence(part)) {
    const count = input.evidence[part.id] ?? 0;
    return count === 0 ? 'none yet' : count === 1 ? '1 file' : `${count} files`;
  }
  const value = part.id === 'title' ? input.title : input.fields[part.id];
  if (value === undefined || value === null || value === '') return '(empty)';
  if (['choice', 'multi', 'check'].includes(part.kind)) return choiceNames(part, value);
  const text = String(value).trimEnd();
  const whole =
    text.length <= VALUE_BRIEF
      ? text
      : `${text.slice(0, VALUE_BRIEF - 1).trimEnd()}… (the whole of it: otea show ${input.id})`;
  // Every line of the value, the later ones indented under its name.
  return whole.split(/\r?\n/).join('\n    ');
}

// A value longer than this is given up to here in `Starts with`, and read whole with otea show, so
// every next stays short.
const VALUE_BRIEF = 500;

const REASON: Readonly<Record<Missing['reason'], string>> = {
  missing: 'missing',
  not_new: 'not new this round',
  unchecked: 'boxes still open',
  unproved: 'points without proof',
  open: 'not finished',
};

// What a missing part says after its name: its reason, and for a checklist short of proof, the
// points that have none ("no proof yet: Paleta, Silueta").
function reasonText(missing: Missing): string {
  if (missing.reason === 'unproved' && missing.points?.length)
    return `no proof yet: ${missing.points.join(', ')}`;
  return REASON[missing.reason];
}

// How an agent proves a checklist point: a line of a log or a test of a report it attached, an
// evidence entry it attached, or a file it attaches for that point.
export function proveText(id: string): string {
  return `Prove each point with otea tick ${id} "<point>" --log <file>:<line> | --test "<test name>" | --evidence <n>, or otea attach ${id} <file> --point "<point>".`;
}

// "RT-4 in Implementar, RT-7 in Propuesta"
function inSteps(open: readonly Linked[]): string {
  return open.map(({ id, step }) => (step ? `${id} in ${step}` : id)).join(', ');
}

// "BUG-9 on Errores, in Arreglar, and BUG-11 on Errores, in Triar"
function onBoards(open: readonly Linked[]): string {
  const list = and(
    open.map(({ id, board, step }) => `${id} on ${board}${step ? `, in ${step}` : ''}`),
  );
  return open.at(-1)?.step ? `${list},` : list;
}

// What the note of the handoff says: the step's hint, or, on a round sent back where the step asks
// for no note and hints at none, what changed since.
function noteHint(step: Step, sentBack: boolean): string {
  const hint = step.note.hint.trim();
  if (hint || step.note.req === 'always') return hint;
  return sentBack ? SENT_BACK_HINT : '';
}

// Whether the handoff carries a note: the step asks for one, or the round was sent back.
function wantsNote(step: Step, input: NextInput): boolean {
  return step.note.req === 'always' || input.sentBack !== undefined;
}

// The note the handoff carries: always the first line of the Handoff when it needs one.
function noteLine(step: Step, input: NextInput): string[] {
  // Under review the note was handed already: the reviewer reads it above, it owes none.
  if (!isClosed(input.position) && input.position.phase !== 'doing') return [];
  if (!wantsNote(step, input)) return [];
  const missing = input.missing.some(({ ref }) => ref === NOTE_REF);
  const hint = noteHint(step, input.sentBack !== undefined);
  return [`  ${missing ? '✗' : '✓'} Note: required${hint ? ` (${hint})` : ''}`];
}

// The block a round sent back starts with: the note as the reviewer wrote it, then who, when and
// from which review.
// A reopened round starts with the reason it was reopened for, who reopened it and when.
function sentBackLines(sent: SentBack): string[] {
  const [first = '', ...rest] = sent.note.trim().split(/\r?\n/);
  const lead = sent.reopened ? 'Reopened' : 'Sent back to you';
  // A send-back with no words of its own went with the person's review comments (P4-7).
  const bare = first.trim() === '';
  const quoted = bare
    ? [`${lead} with the notes from the person above: answer each`]
    : [`${lead}: "${first}`, ...rest.map((line) => `  ${line}`)];
  if (!bare) quoted[quoted.length - 1] += '"';
  const who = sent.by.kind === 'human' ? 'the person' : sent.by.name;
  const from = sent.reopened
    ? `after it was ${sent.step}`
    : `from the review of ${sent.step} round ${sent.round}`;
  return ['', ...quoted, `  by ${who}, ${timeText(sent.at)}, ${from}`];
}

// What the step waits for: the last lines of the Handoff.
function waitLines(step: Step, input: NextInput): string[] {
  const out: string[] = [];
  if (step.waits.includes('parts')) {
    const parts = input.parts ?? [];
    const open = parts.filter(({ closed }) => !closed);
    const name = input.child?.name ?? parts[0]?.board ?? 'Parts';
    out.push(
      parts.length === 0
        ? `  ✓ ${name} finished: none yet, so nothing holds the handoff; add them first if it has any`
        : open.length === 0
          ? `  ✓ ${name} finished: required`
          : `  ✗ ${name} finished: required (${open.length} of ${parts.length} open: ${inSteps(open)})`,
    );
  }
  if (step.waits.includes('blockers')) {
    const open = (input.blockers ?? []).filter(({ closed }) => !closed);
    const verb = open.length === 1 ? 'blocks' : 'block';
    out.push(
      open.length === 0
        ? '  ✓ Nothing open blocks it: required'
        : `  ✗ Nothing open blocks it: required (${onBoards(open)} ${verb} it)`,
    );
  }
  return out;
}

// The Parts section of a board that divides: how many are finished, and how to add one.
function partsLines(def: BoardDefinition, input: NextInput): string[] {
  const child = input.child ?? def;
  const parts = input.parts ?? [];
  const open = parts.filter(({ closed }) => !closed);
  const count =
    parts.length === 0
      ? `  ${child.name}: none yet`
      : `  ${child.name}: ${parts.length - open.length} of ${parts.length} finished${open.length > 0 ? ` (open: ${inSteps(open)})` : ''}`;
  const fields = child.form
    .filter(({ required }) => required)
    .flatMap(({ ref }) => {
      const part = partOf(child, ref);
      return part ? [` --field "${part.name}=…"`] : [];
    })
    .join('');
  return [
    count,
    `  Add one: otea create --collection "${child.name}" --parent ${input.id} --title "…"${fields}`,
  ];
}

// The protected branch of the item, by its value, and the repository it is in when the board says.
function branchOf(
  def: BoardDefinition,
  fields: Readonly<Record<string, unknown>>,
): { value: string; repo?: string; push: string[] } | undefined {
  const branch = guardedBranch(def);
  if (!branch) return undefined;
  const value = String(fields[branch.id] ?? '').trim();
  const repo = branch.guard.repo ? String(fields[branch.guard.repo] ?? '').trim() : '';
  return {
    value: value || `the branch (${branch.name} is empty)`,
    ...(repo ? { repo } : {}),
    push: branch.guard.push.flatMap((id) => stepById(def, id)?.name ?? []),
  };
}

function branchLines(
  def: BoardDefinition,
  step: Step,
  position: Position,
  input: NextInput,
): string[] {
  const branch = branchOf(def, input.fields);
  if (!branch) return [];
  const base = guardedBranch(def)?.guard.base;
  const land = landStepOf(def);
  const landing = gateAt(def, position, 'merge').why === 'landing';
  const into = !base
    ? []
    : landing
      ? [
          `  ${base} is protected too: merge ${branch.value} into it now, in ${step.name}; the person approved ${input.id}.`,
        ]
      : land
        ? [
            `  ${base} is protected too: push or merge ${branch.value} into it only in ${land.name}, once the person approved ${input.id}.`,
          ]
        : [
            `  ${base} is protected too: push or merge ${branch.value} into it only once ${input.id} is ${DONE_NAME}.`,
          ];
  return [...pushLines(def, step, position, branch), ...into];
}

function pushLines(
  def: BoardDefinition,
  step: Step,
  position: Position,
  branch: { value: string; repo?: string; push: string[] },
): string[] {
  const where = `${branch.value}${branch.repo ? ` in ${branch.repo}` : ''}`;
  const land = landStepOf(def);
  const mergedWhen = land
    ? `once the person approves it, an agent merges it in ${land.name}`
    : `it can be merged only once it is ${DONE_NAME}`;
  const merge = `${mergedWhen.charAt(0).toUpperCase()}${mergedWhen.slice(1)}.`;
  const answer = gateAt(def, position, 'push');
  if (answer.why === 'doing') {
    // The land step itself is where the branch is merged; a step nobody reviews never freezes it.
    if (land?.id === step.id)
      return [
        `  ${where}: you may push while you do ${step.name}; it is merged here, in ${step.name}.`,
      ];
    if (step.reviewer === 'none')
      return [`  ${where}: you may push while you do ${step.name}; ${mergedWhen}.`];
    return [
      `  ${where}: you may push while you do ${step.name}. While it is reviewed it is frozen; ${mergedWhen}.`,
    ];
  }
  if (answer.why === 'review') {
    return [`  ${where} is frozen while ${reviewerName(step)} reviews it: do not push. ${merge}`];
  }
  const elsewhere = branch.push.length > 0 ? ` You may push in ${and(branch.push, 'or')}.` : '';
  return [`  ${where}: no pushes in ${step.name}.${elsewhere}`];
}

// How a closed item reads: Done, Dropped, or Dropped with its motive.
export function closedName(def: BoardDefinition, position: Position): string {
  if (!isClosed(position) || position.closed === DONE) return DONE_NAME;
  const motive = position.motive ? motiveById(def, position.motive) : undefined;
  return motive ? `${DROPPED_NAME} (${motive.name})` : DROPPED_NAME;
}

// ` --motive "Rechazado|Duplicado"` on a board with motives.
function motiveFlag(def: BoardDefinition): string {
  const names = def.drop.motives.map(({ name }) => name);
  return names.length === 0 ? '' : ` --motive "${names.join('|')}"`;
}

// The note flag a command shows: the hint as a <placeholder>, so it reads as what to write, never
// as the note itself.
function noteArg(hint: string): string {
  return `--note "<${hint}>"`;
}

function noteFlag(step: Step, input: NextInput): string {
  if (!wantsNote(step, input)) return '';
  return ` ${noteArg(noteHint(step, input.sentBack !== undefined) || 'what changed in this round')}`;
}

function whenText(def: BoardDefinition, hand: Hand): string {
  if (!hand.when) return 'required sometimes';
  const read = partOf(def, hand.when.part);
  const value = read?.options.find(({ id }) => id === hand.when?.value)?.name ?? hand.when.value;
  return `required when ${read?.name ?? '…'} is ${value}`;
}

function handLines(def: BoardDefinition, step: Step, input: NextInput): string[] {
  const lines = [
    ...noteLine(step, input),
    ...partLines(def, step.hand, input),
    ...notesHandLine(input.notes ?? []),
    ...waitLines(step, input),
  ];
  return lines.length === 0 ? ['  nothing required'] : lines;
}

function partLines(def: BoardDefinition, hands: readonly Hand[], input: NextInput): string[] {
  return hands.flatMap((hand) => {
    const part = partOf(def, hand.ref);
    if (!part) return [];
    const missing = input.missing.find(({ ref }) => ref === hand.ref);
    const fresh = hand.fresh && isEvidence(part) ? ', new this round' : '';
    const req =
      hand.req === 'always'
        ? `required${fresh}`
        : hand.req === 'when'
          ? whenText(def, hand)
          : 'optional';
    const mark = missing ? '✗' : hand.req === 'always' ? '✓' : '·';
    const proof = part.kind === 'check' && part.proof ? ', each ticked point with its proof' : '';
    const line = `  ${mark} ${part.name}: ${req}${proof}${missing ? ` (${reasonText(missing)})` : ''}${choicesText(part, hand.req !== 'no', boardLangOf(def))}`;
    return part.hint && hand.req !== 'no' ? [line, `      what goes here: ${part.hint}`] : [line];
  });
}

// What a field takes, when it is a choice: the names an agent fills it with. A checklist the
// handoff asks for (`asked`) takes every box ticked, as the handoff checks.
function choicesText(part: Part, asked: boolean, lang: Lang): string {
  if (part.kind === 'level')
    return `; one of ${LEVELS.map((level) => LEVEL_SAID[lang][level]).join(', ')}`;
  if (part.kind === 'yesno') return `; ${YES_NO_SAID[lang]}`;
  if (part.options.length === 0 || isEvidence(part)) return '';
  const names = part.options.map(({ name }) => name).join(', ');
  if (part.kind === 'choice') return `; one of ${names}`;
  return part.kind === 'check' && asked ? `; tick every one of ${names}` : `; any of ${names}`;
}

// The analysis matrix weighs items by the fields the board maps to effort, risk and impact
// (core/board/analysis.ts): an agent doing a step estimates the ones still empty, and the person
// corrects them.
function estimateLines(def: BoardDefinition, input: NextInput): string[] {
  const empty = mappedScales(def)
    .map((role) => rolePart(def, role))
    .filter((part): part is Part => part !== undefined)
    .filter((part) => {
      const value = input.fields[part.id];
      return value === undefined || value === null || value === '';
    });
  if (empty.length === 0) return [];
  const names = empty.map(({ name }) => name).join(', ');
  const flags = empty.map(({ name }) => ` --field "${name}=…"`).join('');
  // What each takes, so the agent never has to look for it elsewhere.
  const lang = boardLangOf(def);
  const values = empty.flatMap((part) => {
    const takes = choicesText(part, false, lang).replace(/^; /, '');
    return takes ? [`    ${part.name}: ${takes}`] : [];
  });
  return [
    `  The person weighs items by ${names}: estimate them (otea update ${input.id}${flags}); they correct you.`,
    ...values,
  ];
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : ['', title, ...lines];
}

function indent(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => `  ${line}`);
}

// A long board text (a playbook a preset carried) is read whole with otea board; next gives its
// first paragraph and says where the rest is, so every next stays short.
const ABOUT_BRIEF = 600;

function aboutBrief(def: BoardDefinition): string {
  const text = mentionText(def, def.about);
  if (text.length <= ABOUT_BRIEF) return text;
  const paragraphs = text.split(/\r?\n\s*\r?\n/).filter((p) => !/^\s*#/.test(p) && p.trim());
  const first = paragraphs[0]?.trim() ?? '';
  const brief = first.length > ABOUT_BRIEF ? `${first.slice(0, ABOUT_BRIEF - 1)}…` : first;
  return `${brief}\n(The whole of it: otea board "${def.name}")`;
}

export function nextText(def: BoardDefinition, input: NextInput): string {
  const { position, id } = input;
  if (isClosed(position)) {
    const branch = branchOf(def, input.fields);
    const said = input.merged?.commit ? ` (${input.merged.commit})` : '';
    // On a board with a land step, Done means an agent already merged it there.
    const land = landStepOf(def);
    const merge =
      position.closed !== DONE || !branch
        ? ''
        : input.merged
          ? ` Its branch ${branch.value} was merged${said}.`
          : land
            ? ` Its branch ${branch.value} was merged in ${land.name}.`
            : ` Its branch ${branch.value} may be merged now; once it is, otea merged ${id} --pr <url>.${reopenHint(def, id)}`;
    const chose = input.chosen
      ? ` The person chose ${input.chosen.option} · ${input.chosen.name}.`
      : '';
    return `${id} · ${def.item} · ${closedName(def, position)}\nClosed: nothing left to do.${chose}${merge}`;
  }
  const step = stepById(def, position.step);
  if (!step) return `${id} · ${def.item}\nThis item stands in a step the board no longer has.`;
  const head = `${id} · ${def.item} · ${step.name}, round ${input.round}`;
  const reviewing = position.phase !== 'doing';
  if (!reviewing && step.doer === 'you')
    return `${head}\nThe person does this step: pick another item.`;
  if (reviewing && step.reviewer !== 'any')
    return `${head}\nWaiting for the person to review it: pick another item.`;
  if (reviewing && input.me !== undefined && input.did?.includes(input.me))
    return `${head}\nYou did this step in this round: another agent reviews it. Pick another item.`;
  const elsewhere = heldElsewhere(input);
  if (elsewhere) return `${head}\n${elsewhere}`;
  const open = reviewing ? undefined : input.questions?.find(({ answer }) => !answer);
  if (open) return [head, ...waitingAnswerText(open, input.me)].join('\n');

  const ways = waysOf(def, step.id);
  const names = ways.map((way) => targetName(def, way));
  const doerName = input.did?.length
    ? and([...input.did], 'and')
    : step.doer === 'you'
      ? 'the person'
      : 'another agent';
  // The person reading at a terminal (no agent name) reads what the agent is told, as the agent's.
  const person = input.me === PERSON_READER.name;
  const turn = reviewing
    ? `review this step (${doerName} did it).`
    : person
      ? 'an agent does this step.'
      : 'do this step.';
  const lines = [head, `${person ? "An agent's turn" : 'Your turn'}: ${turn}`];
  if (!input.holder && input.leftFor !== undefined && input.leftFor === input.me)
    lines.push('The person left it for you.');
  if (!person) lines.push(holdLine(input));
  else if (input.holder)
    lines.push(`Held by ${input.holder.name} until ${timeText(input.holder.expiresAt)}.`);
  if (reviewing && input.handed?.note.trim())
    lines.push(
      '',
      `Handoff note from ${input.handed.by}:`,
      ...input.handed.note
        .trim()
        .split(/\r?\n/)
        .map((line) => `  ${line}`),
    );
  if (!reviewing) lines.push(...notesBlock(id, input.notes ?? [], input.me));
  if (!reviewing && input.sentBack) lines.push(...sentBackLines(input.sentBack));
  if (!reviewing) lines.push(...answersBlock(input.questions ?? [], input.me));
  lines.push(...section('About this board', indent(aboutBrief(def))));
  if (input.chosen) lines.push(...section('The person chose', choiceLines(input.chosen)));
  if (input.parent) lines.push(...section('Part of', [`  ${parentLine(input.parent)}`]));
  if (input.implements?.length)
    lines.push(
      ...section(
        'Implements',
        input.implements.map((it) => `  ${parentLine(it)}`),
      ),
    );
  lines.push(
    ...section(
      'Starts with',
      startsWith(def, step.id).flatMap(({ ref, from }) => {
        const part = partOf(def, ref);
        if (!part) return [];
        // What an earlier step left empty (a deliverable asked only sometimes) is not there to read.
        if (from && isEmpty(part, input)) return [];
        const origin = from ? ` (from ${stepById(def, from)?.name ?? from})` : '';
        return [`  ${part.name}${origin}: ${valueText(part, input)}`];
      }),
    ),
  );
  if (def.split) lines.push(...section('Parts', partsLines(def, input)));
  const instruction = reviewing ? step.instructions.review : step.instructions.take;
  lines.push(
    ...section(
      reviewing ? 'When you review it' : 'When you take it',
      indent(mentionText(def, instruction)),
    ),
  );
  // Work handed in some other way carries nothing of an otea handoff.
  if (reviewing || !input.handIn) lines.push(...section('Handoff', handLines(def, step, input)));
  if (!reviewing) lines.push(...section('Estimate', estimateLines(def, input)));
  lines.push(...section('Branch', branchLines(def, step, position, input)));
  if (!reviewing)
    lines.push(
      ...section('Before you hand it off', indent(mentionText(def, step.instructions.before))),
    );

  let after: string;
  const several = ways.length > 1;
  if (reviewing) {
    const back = targetName(def, backTarget(def, step.id));
    const pick = several
      ? `${and(names, 'or')}: you pick with --way when approving`
      : `${names[0]}, once you approve it`;
    after = `${pick}; a send-back returns it to ${back}`;
  } else if (step.reviewer === 'none') {
    after = several ? `${and(names, 'or')}: you pick with --way and say why` : `${names[0]}`;
  } else {
    const who = reviewerName(step);
    after = several
      ? `${and(names, 'or')}: ${who} picks when approving it`
      : `${names[0]}, once ${who} approves it`;
  }
  const others: string[] = [];
  if (!reviewing) {
    for (const earlier of backWaysOf(def, step.id)) {
      const name = targetName(def, earlier);
      others.push(
        `  Or take it back to ${name} (no review; ${name} starts its next round):`,
        `    otea handoff ${id} --way "${name}" --reason "why"`,
      );
    }
    if (step.doerMayDrop && step.doer !== 'you')
      others.push(
        `  Or drop it if it is not worth doing: otea drop ${id} --reason "why"${motiveFlag(def)}`,
      );
  }
  const handIn = reviewing ? undefined : input.handIn;
  if (handIn) {
    lines.push(...section('Next', [`  ${handIn.after}`]));
    lines.push(...section('When you finish', [`  ${handIn.command}`]));
    return lines.join('\n');
  }
  lines.push(...section('Next', [`  ${after}`, ...others]));

  const choice = `"<${names.join('|')}>"`;
  const finish = reviewing
    ? [
        `  otea approve ${id}${several ? ` --way ${choice}` : ''}`,
        `  otea send-back ${id} --reason "what to change"`,
      ]
    : [
        `  otea handoff ${id}${several && step.reviewer === 'none' ? ` --way ${choice} --reason "why"` : ''}${noteFlag(step, input)}`,
      ];
  lines.push(...section('When you finish', finish));
  return lines.join('\n');
}

const MISSING_NOTE: Readonly<Record<Missing['reason'], string>> = {
  missing: '',
  not_new: 'new this round',
  unchecked: 'every box ticked',
  unproved: 'a proof for each ticked point',
  open: '',
};

// "RT-4 (Implementar), RT-7 (Propuesta)"; with `board`, "BUG-9 (Errores, Arreglar)".
function named(open: readonly Linked[], board = false): string[] {
  return open.map(({ id, board: on, step, unmerged }) => {
    const at = step ?? (unmerged ? `${DONE_NAME}, not merged yet` : '');
    const where = [board ? on : '', at].filter(Boolean).join(', ');
    return where ? `${id} (${where})` : id;
  });
}

// What holds a parent back while its parts are open, said of the item `id`.
// Parts that are Done but wait to be merged are said so: "not merged yet".
function partsHold(id: string, wait: Missing): string {
  const open = wait.open ?? [];
  const total = wait.total ?? open.length;
  const list = named(open).join(', ');
  const state =
    open.length > 0 && open.every((linked) => linked.unmerged) ? 'not merged yet' : 'not finished';
  if (total === 1 && open.length === 1) return `its part ${list} is ${state}`;
  if (open.length === total) return `its ${total} ${wait.name} are ${state}: ${list}`;
  const verb = open.length === 1 ? 'is' : 'are';
  return `${open.length} of its ${total} ${wait.name} ${verb} ${state}: ${list}`;
}

// `unmerged`: every one of them is Done and waits to be merged; `some`, at least one is.
function blockersHold(wait: Missing): {
  text: string;
  them: string;
  one: boolean;
  unmerged: boolean;
  some: boolean;
} {
  const open = wait.open ?? [];
  const one = open.length === 1;
  const unmerged = open.length > 0 && open.every((linked) => linked.unmerged);
  const some = open.some((linked) => linked.unmerged);
  const state = unmerged ? 'not merged yet' : 'not finished';
  const text = `${and(named(open, true))} ${one ? 'blocks it and is' : 'block it and are'} ${state}`;
  return { text, them: one ? (open[0]?.id ?? '') : 'they', one, unmerged, some };
}

// The exact refusal of a handoff that lacks something: the parts and the note lead; when only
// what it waits for holds it, that alone, with what to do.
export function refusalText(id: string, missing: readonly Missing[]): string {
  const asked = missing.find(({ ref }) => ref === NOTES_REF)?.notes ?? [];
  const rest = missing.filter(({ ref }) => ref !== NOTES_REF);
  const notes = notesRefusal(id, asked);
  if (rest.length === 0) return notes.join('\n');
  return [lackingText(id, rest), ...notes].join('\n');
}

function lackingText(id: string, missing: readonly Missing[]): string {
  const note = missing.find(({ ref }) => ref === NOTE_REF);
  const hint =
    note?.hint?.trim() || (note?.sentBack ? SENT_BACK_HINT : 'what changed in this round');
  const flag = note ? ` with ${noteArg(hint)}` : '';
  const parts = missing.filter(({ reason, ref }) => reason !== 'open' && ref !== NOTE_REF);
  if (parts.length > 0 || note) {
    const what = parts.map(({ name, reason, fresh, points }) => {
      const said =
        reason === 'missing' && fresh
          ? 'new this round'
          : reason === 'unproved' && points?.length
            ? `a proof for ${and(points)}`
            : MISSING_NOTE[reason];
      return said ? `${name} (${said})` : name;
    });
    if (note)
      what.push(note.sentBack ? 'a note (it was sent back: say what you changed)' : 'a note');
    const then =
      parts.length === 0
        ? `Call handoff again${flag}.`
        : `Attach or fill them with otea attach ${id} / otea update ${id}, then call handoff again${flag}.`;
    const prove = parts.some(({ reason }) => reason === 'unproved') ? [proveText(id)] : [];
    return [`Not handed off ${id}: missing ${and(what)}.`, then, ...prove].join('\n');
  }
  const lines: string[] = [];
  const waitingParts = missing.find(({ ref }) => ref === WAIT_PARTS);
  const waitingBlockers = missing.find(({ ref }) => ref === WAIT_BLOCKERS);
  if (waitingParts) {
    const unmerged = (waitingParts.open ?? []).some((linked) => linked.unmerged);
    const until = unmerged ? `${DONE_NAME} and merged (otea merged)` : DONE_NAME;
    lines.push(
      `Not handed off ${id}: ${partsHold(id, waitingParts)}.`,
      `Nothing moves ${id} for them: hand it off again once they are ${until} or ${DROPPED_NAME}.`,
    );
  }
  if (waitingBlockers) {
    const hold = blockersHold(waitingBlockers);
    const record = hold.one ? ` (otea merged ${hold.them})` : '';
    const until = hold.unmerged
      ? `merged${record}`
      : hold.some
        ? `${DONE_NAME} and merged`
        : DONE_NAME;
    lines.push(
      `Not handed off ${id}: ${hold.text}.`,
      `Hand it off again once ${hold.them} ${hold.one ? 'is' : 'are'} ${until} or ${DROPPED_NAME}, or ask the person to remove the link.`,
    );
  }
  return lines.join('\n');
}

// The refusal of an approval whose waits do not hold: a part not finished (reopened, or never
// finished), or a blocker added. Parts are said as a handoff says them, and as the web UI does.
export function approvalRefusalText(id: string, missing: readonly Missing[]): string {
  const sentences = missing.flatMap((wait) => {
    if (wait.ref === WAIT_PARTS) return [partsHold(id, wait)];
    if (wait.ref === WAIT_BLOCKERS) return [blockersHold(wait).text];
    return [];
  });
  return `Not approved ${id}: ${sentences.join('; ')}.`;
}

// The refusal of a way back without a reason.
export const NOT_TAKEN_BACK = 'Not taken back: say why with --reason.';

// The refusal of a way the step does not have, with the ways it has: on to a later step (or Done)
// and, while it is being done, back to an earlier one with a reason.
export function noWayText(
  def: BoardDefinition,
  id: string,
  stepId: string,
  way: string,
  reviewing = false,
): string {
  const name = targetName(def, stepId);
  const on = waysOf(def, stepId).map((target) => targetName(def, target));
  const back = reviewing ? [] : backWaysOf(def, stepId).map((target) => targetName(def, target));
  const choice = back.length === 1 ? (back[0] ?? '') : `<${back.join('|')}>`;
  const backText =
    back.length === 0
      ? ''
      : `, or back to ${and(back, 'or')} (otea handoff ${id} --way "${choice}" --reason "why")`;
  return `${id} has no way "${way}" from ${name}. From ${name} it goes on to ${and(on, 'or')}${backText}.`;
}

// The line after the doer takes an item back to an earlier step.
export function takenBackText(
  def: BoardDefinition,
  id: string,
  stepId: string,
  round: number,
): string {
  return `Taken back. ${id} returns to ${targetName(def, stepId)}, round ${round}.`;
}

// Why a discard was refused (engine drop codes), in the agent's words.
export function dropRefusalText(
  def: BoardDefinition,
  id: string,
  code: 'not_open' | 'reason_required' | 'motive_required' | 'not_droppable' | 'not_relayable',
): string {
  switch (code) {
    case 'not_open':
      return `Not dropped ${id}: it is already closed.`;
    case 'reason_required':
      return `Not dropped ${id}: say why with --reason.`;
    case 'motive_required':
      return `Not dropped ${id}: say which with${motiveFlag(def)}.`;
    case 'not_droppable':
      return `Not dropped ${id}: only the person drops items here.`;
    case 'not_relayable':
      return `Not relayed: on ${def.name} the person drops items from the item's page.`;
  }
}

// The line after a discard.
export function droppedText(def: BoardDefinition, id: string, to: Position): string {
  return `Dropped. ${id} is ${closedName(def, to)}.`;
}

// The line after otea create: where the item starts, and why when the first step was skipped or
// still lacks something.
export function createdText(
  def: BoardDefinition,
  id: string,
  at: Position,
  missing: readonly Missing[],
): string {
  if (isClosed(at)) return `Created ${id}.`;
  const name = targetName(def, at.step);
  const first = def.steps[0];
  if (first && first.id !== at.step)
    return `Created ${id} in ${name}: it already had everything ${first.name} asks for.`;
  const lacking = missing.filter(({ reason }) => reason !== 'open' && reason !== undefined);
  if (first?.skipWhenReady && lacking.length > 0)
    return `Created ${id} in ${name}: missing ${and(lacking.map(({ name: part }) => part))}. Fill ${lacking.length === 1 ? 'it' : 'them'}, then otea handoff ${id}.`;
  return `Created ${id} in ${name}.`;
}

// The refusal of a part created alone on a board whose items are always part of another's.
export function parentRequiredText(child: BoardDefinition, parent: BoardDefinition): string {
  return `Not created: each ${child.item} is always part of one ${parent.item}. Create it with --parent <the id of that ${parent.item}>.`;
}

// The refusal of a part on a board the parent does not divide into.
export function parentTypeText(
  parent: BoardDefinition,
  child: BoardDefinition,
  other: string,
  otherBoard: string,
): string {
  return `Not linked: the parts of each ${parent.item} are on ${child.name}, and ${other} is on ${otherBoard}.`;
}

// A board that divides into nothing keeps an item's parts on itself: a part on another board is
// refused, and the links that are free between boards are named.
export function partsAtHomeText(
  parent: BoardDefinition,
  parentId: string,
  other: string,
  otherBoard: string,
): string {
  return `Not linked: a ${parent.item}'s parts stay on ${parent.name}, and ${other} is on ${otherBoard}. Link ${other} blocks ${parentId} to make ${parentId} wait, or ${other} implements ${parentId}.`;
}

// Where an item is, as a sentence says it after "is in": the step, or its review ("the review of
// Implementar"), so an item that waits for a review never reads as still being done.
export function placeText(def: BoardDefinition, position: Position): string {
  if (isClosed(position)) return position.closed === DONE ? DONE_NAME : DROPPED_NAME;
  const name = stepById(def, position.step)?.name ?? position.step;
  if (position.phase === 'review') return `the review of ${name}`;
  return name;
}

// The way back for a Done item whose branch is not merged yet: its PR may stop merging as it is
// (another branch merged first and now conflicts), and its frozen branch cannot be fixed while it
// stays Done. Empty on a board that protects no branch.
function reopenHint(def: BoardDefinition, id: string): string {
  const step = reopenStep(def);
  const name = step === undefined ? undefined : stepById(def, step)?.name;
  if (name === undefined) return '';
  return ` If its PR cannot merge as it is (a conflict), otea reopen ${id} --reason "…" takes it back to ${name}.`;
}

// The line after otea reopen: where the item stands again, and that it is reviewed again.
export function reopenedText(def: BoardDefinition, id: string, step: string): string {
  const name = stepById(def, step)?.name ?? step;
  return `Reopened ${id}: it is in ${name} again. Fix its branch there and hand it off: it goes through review again before it is ${DONE_NAME}.`;
}

// What otea check answers for one item, in the board's words. `merged`: whether a Done item's
// branch was marked merged; while it is not, a refused push says how to reopen it.
export function gateText(
  def: BoardDefinition,
  id: string,
  position: Position,
  action: GateAction,
  round: number,
  merged = true,
): string {
  const answer = gateAt(def, position, action);
  const push = and(
    (guardedBranch(def)?.guard.push ?? []).flatMap((s) => stepById(def, s)?.name ?? []),
    'or',
  );
  const step = isClosed(position) ? undefined : stepById(def, position.step);
  const name = step?.name ?? '';
  const where = placeText(def, position);
  switch (answer.why) {
    case 'unguarded':
      return `${action} allowed: ${def.name} protects no branch.`;
    case 'doing':
      return `push allowed: ${id} is being done in ${name}.`;
    case 'done':
      return `merge allowed: ${id} is ${DONE_NAME}.`;
    case 'landing':
      return `merge allowed: ${id} is being landed in ${name}, after the person's approval.`;
    case 'review': {
      const who = step ? reviewerName(step) : 'the person';
      return `push refused: ${id} waits for ${who} to review ${name}; its branch can be pushed only while ${push} is being done.`;
    }
    case 'not_push_step':
      return `push refused: ${id} is in ${where}; its branch can be pushed only while ${push} is being done.`;
    case 'closed': {
      const refused = `push refused: ${id} is ${closedName(def, position)}; nothing is pushed to a closed item's branch.`;
      const step = reopenStep(def);
      const name = step === undefined ? undefined : stepById(def, step)?.name;
      const done = isClosed(position) && position.closed === DONE;
      // On a board with a land step, a Done item was merged there: it never reopens.
      if (!done || merged || name === undefined || landStepOf(def)) return refused;
      return `${refused} If its PR cannot merge as it is (a conflict), reopen it: otea reopen ${id} --reason "…" takes it back to ${name}, and through review again.`;
    }
    case 'not_done':
      return isClosed(position)
        ? `merge refused: ${id} is ${closedName(def, position)}; its branch can be merged ${mergedOnlyWhen(def, id)}.`
        : `merge refused: ${id} is in ${where}, round ${round}; its branch can be merged ${mergedOnlyWhen(def, id)}.`;
  }
}

// When an item's branch may be merged: once it is Done, or on a board with a land step once the
// person approved it, while an agent lands it there.
function mergedOnlyWhen(def: BoardDefinition, id: string): string {
  const land = landStepOf(def);
  return land
    ? `only once the person approved ${id}: while it is being landed in ${land.name}, or once it is ${DONE_NAME}`
    : `only once ${id} is ${DONE_NAME}`;
}

// What otea check answers for one item whose branch a push or merge brings into the base branch
// the board protects: allowed only once the item is Hecho.
export function baseGateText(
  def: BoardDefinition,
  id: string,
  position: Position,
  action: GateAction,
  round: number,
  base: string,
): string {
  if (isClosed(position) && position.closed === DONE)
    return `${action} allowed: ${id} is ${DONE_NAME}; ${base} takes its branch.`;
  if (gateAt(def, position, 'merge').why === 'landing')
    return `${action} allowed: ${id} is being landed in ${placeText(def, position)}, after the person's approval; ${base} takes its branch.`;
  const where = isClosed(position)
    ? `is ${closedName(def, position)}`
    : `is in ${stepById(def, position.step)?.name ?? ''}, round ${round}`;
  return `${action} refused: ${id} ${where}; ${base} takes its branch ${mergedOnlyWhen(def, id)}.`;
}

// Why a push or merge into the protected base branch that brings in no item of the board is
// refused.
// Said once for every board that protects `base`, so a branch of any of them is named.
export function baseRefusal(
  all: readonly BoardDefinition[],
  action: GateAction,
  base: string,
): string {
  const names = all.map((def) => def.name).join(' and ');
  // Named by board, never "a <item>": an item's name is the board's language ("a Entrega").
  const items = `an item of ${all.map((def) => def.name).join(' or ')}`;
  const verb = all.length > 1 ? 'protect' : 'protects';
  const lands = all.flatMap((def) => landStepOf(def)?.name ?? []);
  const when =
    lands.length === all.length
      ? `the person approved (being landed in ${[...new Set(lands)].join(' or ')}, or ${DONE_NAME})`
      : `that is ${DONE_NAME}`;
  return `${action} refused: ${base} is the base branch ${names} ${verb}; it takes only the branch of ${items} ${when}, and this ${action} brings in none.`;
}

// The line after a handoff or an approval: where the item stands now.
export function handedText(
  def: BoardDefinition,
  id: string,
  to: Position,
  said: 'Handed off' | 'Approved' = 'Handed off',
): string {
  if (isClosed(to)) return `${said}. ${id} is ${to.closed === DONE ? DONE_NAME : DROPPED_NAME}.`;
  const step = stepById(def, to.step);
  const name = step?.name ?? to.step;
  if (to.phase === 'doing') return `${said}. ${id} moves on to ${name}.`;
  const who = step ? reviewerName(step) : 'the person';
  return `${said}. ${id} waits for ${who} to review ${name}.`;
}

// The line after a send-back: the step it returns to, for its next round.
export function sentBackText(def: BoardDefinition, id: string, step: string, round: number) {
  return `Sent back. ${id} returns to ${targetName(def, step)}, round ${round}.`;
}

// `toMerge`: its Done items whose branch is not marked merged yet, on a board with no land step
// (there an agent merges what the person approved once it is Done).
export type IdleBoard = {
  def: BoardDefinition;
  waitingForYou: number;
  toMerge?: readonly { id: string; branch: string }[];
};

// What `next` answers when nothing on the boards asked is the agent's: that, once, naming them; each
// board's own words for idle time and its cap on new items when it is on; and how to wait for the
// next item (on `collection` when next was asked of one).
export function idleText(boards: readonly IdleBoard[], collection?: string): string {
  const names = boards.map(({ def }) => def.name);
  const lines = [`Nothing to do on ${and(names, 'or')} right now.`];
  const of = (title: string, def: BoardDefinition) =>
    boards.length > 1 ? `${title} on ${def.name}` : title;
  for (const { def, waitingForYou } of boards) {
    lines.push(
      ...section(
        boards.length > 1
          ? `On ${def.name}, when there is nothing to do`
          : 'When there is nothing to do',
        indent(mentionText(def, def.idle)),
      ),
    );
    if (def.cap.on) {
      const room = waitingForYou < def.cap.n;
      lines.push(
        ...section(of('New items', def), [
          room
            ? `  You may add items while fewer than ${def.cap.n} wait for the person (${waitingForYou} do).`
            : `  Do not add items: ${waitingForYou} already wait for the person (the cap is ${def.cap.n}).`,
        ]),
      );
    }
  }
  lines.push(...mergeLines(boards.flatMap(({ toMerge: done }) => done ?? [])));
  const on = collection === undefined ? '' : ` --collection ${quoted(collection)}`;
  if (lines.length > 1) lines.push('');
  lines.push(`Wait for one: otea wait --turn agent --unclaimed${on}, then otea next${on}.`);
  return lines.join('\n');
}

// The Done items whose branch waits to be merged, each with how to merge and record it.
export type ToMerge = { id: string; branch: string };

export function mergeLines(toMerge: readonly ToMerge[]): string[] {
  return section(
    'Waiting to be merged',
    toMerge.map(
      ({ id, branch }) =>
        `  ${id} (${branch}) is ${DONE_NAME}: merge its PR, then otea merged ${id} --pr <url>.`,
    ),
  );
}

// What next says when the item to take waits for parts still to be merged: merge them first.
export function mergeFirstText(id: string, toMerge: readonly ToMerge[]): string {
  return [
    `Merge first: ${id} waits for its parts to be merged.`,
    ...mergeLines(toMerge),
    '',
    'Then run otea next again.',
  ].join('\n');
}

// A name as a command line takes it: bare when it is one plain word, quoted otherwise.
function quoted(name: string): string {
  return /^[\w.-]+$/.test(name) ? name : `"${name}"`;
}

// Who reviews a step, as a sentence names them: never the agent that did the round.
function reviewerName(step: Step): string {
  return step.reviewer === 'any' ? 'another agent' : 'the person';
}

function whoDoes(step: Step): string {
  return step.doer === 'you' ? 'the person does it' : 'any agent does it';
}

function whoReviews(step: Step): string {
  if (step.reviewer === 'none') return '';
  if (step.reviewer === 'you') return '; the person reviews it';
  return '; another agent reviews it, never the one that did it';
}

// What `otea board` prints: the board's own words for agents (about it, idle time, the cap) and
// each step's instructions, mentions read with today's names.
// The values each field the board uses takes, as the board says them, so an agent never has to
// look for them elsewhere (an agent once read otea.db for a choice's options).
function fieldValueLines(def: BoardDefinition): string[] {
  const used = usedRefs(def);
  const lang = boardLangOf(def);
  return Object.values(def.parts).flatMap((part) => {
    const takes = used.has(part.id) ? choicesText(part, false, lang).replace(/^; /, '') : '';
    return takes ? [`  ${part.name}: ${takes}`] : [];
  });
}

export function boardText(def: BoardDefinition): string {
  const lines = [`${def.name}: steps for each ${def.item}`];
  lines.push(...section('About this board', indent(mentionText(def, def.about))));
  lines.push(...section('When there is nothing to do', indent(mentionText(def, def.idle))));
  if (def.cap.on)
    lines.push(
      ...section('New items', [
        `  Add items only while fewer than ${def.cap.n} wait for the person.`,
      ]),
    );
  lines.push(...section('What its fields take', fieldValueLines(def)));
  def.steps.forEach((step, index) => {
    const say = (title: string, text: string) => {
      const body = indent(mentionText(def, text)).map((line) => `   ${line}`);
      return body.length === 0 ? [] : [`   ${title}`, ...body];
    };
    lines.push(
      '',
      `${index + 1}. ${step.name}: ${whoDoes(step)}${whoReviews(step)}`,
      ...say('When you take it', step.instructions.take),
      ...say('Before you hand it off', step.instructions.before),
      ...(step.reviewer === 'none' ? [] : say('When you review it', step.instructions.review)),
    );
  });
  lines.push('', 'Run otea next to get the item to take now.');
  return lines.join('\n');
}
