import {
  backTarget,
  backWaysOf,
  type GateAction,
  gateAt,
  isClosed,
  type Linked,
  type Missing,
  NOTE_REF,
  type Position,
  startsWith,
  WAIT_BLOCKERS,
  WAIT_PARTS,
  waysOf,
} from './engine.ts';
import { mentionText } from './mentions.ts';
import {
  type BoardDefinition,
  DONE,
  guardedBranch,
  type Hand,
  isAgent,
  isEvidence,
  LEVELS,
  motiveById,
  type Part,
  partOf,
  type Step,
  stepById,
  type Target,
} from './model.ts';

// The one writer of what an agent reads: `next`'s answer for an item at a step, the refusal of a
// handoff and the line after one. Studio's "Lo que lee el agente" calls the same functions on the
// draft, so the preview is the real text. Agents read English, as the CLI and the API speak it; the
// board's own words (names, hints, instructions) appear as the person typed them.

export const DONE_NAME = 'Done';
export const DROPPED_NAME = 'Dropped';

// The send-back that started the round being done: the reviewer's note, who sent it (`by`) and
// when, and the review it came from (that step's name and round).
export type SentBack = {
  note: string;
  by: { kind: 'human' | 'agent'; name: string };
  at: string;
  step: string;
  round: number;
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
};

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

function valueText(part: Part, input: NextInput): string {
  if (isEvidence(part)) {
    const count = input.evidence[part.id] ?? 0;
    return count === 0 ? 'none yet' : count === 1 ? '1 file' : `${count} files`;
  }
  const value = part.id === 'title' ? input.title : input.fields[part.id];
  if (value === undefined || value === null || value === '') return '(empty)';
  if (['choice', 'multi', 'check'].includes(part.kind)) return choiceNames(part, value);
  const line = String(value).split(/\r?\n/)[0] ?? '';
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

const REASON: Readonly<Record<Missing['reason'], string>> = {
  missing: 'missing',
  not_new: 'not new this round',
  unchecked: 'boxes still open',
  open: 'not finished',
};

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
  if (!wantsNote(step, input)) return [];
  const missing = input.missing.some(({ ref }) => ref === NOTE_REF);
  const hint = noteHint(step, input.sentBack !== undefined);
  return [`  ${missing ? '✗' : '✓'} Note: required${hint ? ` (${hint})` : ''}`];
}

// "2026-11-12 10:04 UTC": one clock for every agent, wherever it runs.
function utcText(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}

// The block a round sent back starts with: the note as the reviewer wrote it, then who, when and
// from which review.
function sentBackLines(sent: SentBack): string[] {
  const [first = '', ...rest] = sent.note.trim().split(/\r?\n/);
  const quoted = [`Sent back to you: "${first}`, ...rest.map((line) => `  ${line}`)];
  quoted[quoted.length - 1] += '"';
  const who = sent.by.kind === 'human' ? 'the person' : sent.by.name;
  return [
    '',
    ...quoted,
    `  by ${who}, ${utcText(sent.at)}, from the review of ${sent.step} round ${sent.round}`,
  ];
}

// What the step waits for: the last lines of the Handoff.
function waitLines(step: Step, input: NextInput): string[] {
  const out: string[] = [];
  if (step.waits.includes('parts')) {
    const parts = input.parts ?? [];
    const open = parts.filter(({ closed }) => !closed);
    const name = input.child?.name ?? parts[0]?.board ?? 'Parts';
    out.push(
      open.length === 0
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
    value: value || `its ${branch.name}`,
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
  const into = base
    ? [
        `  ${base} is protected too: push or merge ${branch.value} into it only once ${input.id} is ${DONE_NAME}.`,
      ]
    : [];
  return [...pushLines(def, step, position, branch), ...into];
}

function pushLines(
  def: BoardDefinition,
  step: Step,
  position: Position,
  branch: { value: string; repo?: string; push: string[] },
): string[] {
  const where = `${branch.value}${branch.repo ? ` in ${branch.repo}` : ''}`;
  const merge = `It can be merged only once it is ${DONE_NAME}.`;
  const answer = gateAt(def, position, 'push');
  if (answer.why === 'doing')
    return [
      `  ${where}: you may push while you do ${step.name}. While it is reviewed it is frozen; it can be merged only once it is ${DONE_NAME}.`,
    ];
  if (answer.why === 'review') {
    const who =
      isAgent(step.reviewer) && !isClosed(position) && position.phase === 'review'
        ? step.reviewer.agent
        : 'the person';
    return [`  ${where} is frozen while ${who} reviews it: do not push. ${merge}`];
  }
  const elsewhere = branch.push.length > 0 ? ` You may push in ${and(branch.push, 'or')}.` : '';
  return [`  ${where}: no pushes in ${step.name}.${elsewhere}`];
}

// How a closed item reads: Done, Dropped, or Dropped with its motive.
function closedName(def: BoardDefinition, position: Position): string {
  if (!isClosed(position) || position.closed === DONE) return DONE_NAME;
  const motive = position.motive ? motiveById(def, position.motive) : undefined;
  return motive ? `${DROPPED_NAME} (${motive.name})` : DROPPED_NAME;
}

// ` --motive "Rechazado|Duplicado"` on a board with motives.
function motiveFlag(def: BoardDefinition): string {
  const names = def.drop.motives.map(({ name }) => name);
  return names.length === 0 ? '' : ` --motive "${names.join('|')}"`;
}

function noteFlag(step: Step, input: NextInput): string {
  if (!wantsNote(step, input)) return '';
  return ` --note "${noteHint(step, input.sentBack !== undefined) || 'what changed in this round'}"`;
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
    const line = `  ${mark} ${part.name}: ${req}${missing ? ` (${REASON[missing.reason]})` : ''}${choicesText(part)}`;
    return part.hint && hand.req !== 'no' ? [line, `      what goes here: ${part.hint}`] : [line];
  });
}

// What a field takes, when it is a choice: the names an agent fills it with.
function choicesText(part: Part): string {
  if (part.kind === 'level') return `; one of ${LEVELS.join(', ')}`;
  if (part.kind === 'yesno') return '; yes or no';
  if (part.options.length === 0 || isEvidence(part)) return '';
  const names = part.options.map(({ name }) => name).join(', ');
  return part.kind === 'choice' ? `; one of ${names}` : `; any of ${names}`;
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
    const merge =
      position.closed === DONE && branch ? ` Its branch ${branch.value} may be merged now.` : '';
    return `${id} · ${def.item} · ${closedName(def, position)}\nClosed: nothing left to do.${merge}`;
  }
  const step = stepById(def, position.step);
  if (!step) return `${id} · ${def.item}\nThis item stands in a step the board no longer has.`;
  const head = `${id} · ${def.item} · ${step.name}, round ${input.round}`;
  const reviewing = position.phase !== 'doing';
  if (!reviewing && step.doer === 'you')
    return `${head}\nThe person does this step: pick another item.`;
  if (reviewing && (position.phase === 'yours' || !isAgent(step.reviewer)))
    return `${head}\nWaiting for the person to review it: pick another item.`;
  if (!reviewing && isAgent(step.doer) && input.me !== undefined && input.me !== step.doer.agent)
    return `${head}\n${step.doer.agent} does this step: pick another item.`;

  const ways = waysOf(def, step.id);
  const names = ways.map((way) => targetName(def, way));
  const doerName = isAgent(step.doer) ? step.doer.agent : 'another agent';
  const lines = [
    head,
    reviewing ? `Your turn: review this step (${doerName} did it).` : 'Your turn: do this step.',
  ];
  if (!reviewing && input.sentBack) lines.push(...sentBackLines(input.sentBack));
  lines.push(...section('About this board', indent(aboutBrief(def))));
  lines.push(
    ...section(
      'Starts with',
      startsWith(def, step.id).flatMap(({ ref, from }) => {
        const part = partOf(def, ref);
        if (!part) return [];
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
  lines.push(...section('Handoff', handLines(def, step, input)));
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
    const who = step.reviewer === 'you' ? 'the person' : step.reviewer.agent;
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
  open: '',
};

// "RT-4 (Implementar), RT-7 (Propuesta)"; with `board`, "BUG-9 (Errores, Arreglar)".
function named(open: readonly Linked[], board = false): string[] {
  return open.map(({ id, board: on, step }) => {
    const where = [board ? on : '', step ?? ''].filter(Boolean).join(', ');
    return where ? `${id} (${where})` : id;
  });
}

// What holds a parent back while its parts are open, said of the item `id`.
function partsHold(id: string, wait: Missing): string {
  const open = wait.open ?? [];
  const total = wait.total ?? open.length;
  const list = named(open).join(', ');
  if (total === 1 && open.length === 1) return `its part ${list} is not finished`;
  if (open.length === total) return `its ${total} ${wait.name} are not finished: ${list}`;
  const verb = open.length === 1 ? 'is' : 'are';
  return `${open.length} of its ${total} ${wait.name} ${verb} not finished: ${list}`;
}

function blockersHold(wait: Missing): { text: string; them: string; one: boolean } {
  const open = wait.open ?? [];
  const one = open.length === 1;
  const text = `${and(named(open, true))} ${one ? 'blocks it and is' : 'block it and are'} not finished`;
  return { text, them: one ? (open[0]?.id ?? '') : 'they', one };
}

// The exact refusal of a handoff that lacks something: the parts and the note lead; when only
// what it waits for holds it, that alone, with what to do.
export function refusalText(id: string, missing: readonly Missing[]): string {
  const note = missing.find(({ ref }) => ref === NOTE_REF);
  const hint =
    note?.hint?.trim() || (note?.sentBack ? SENT_BACK_HINT : 'what changed in this round');
  const flag = note ? ` with --note "${hint}"` : '';
  const parts = missing.filter(({ reason, ref }) => reason !== 'open' && ref !== NOTE_REF);
  if (parts.length > 0 || note) {
    const what = parts.map(({ name, reason, fresh }) => {
      const said = reason === 'missing' && fresh ? 'new this round' : MISSING_NOTE[reason];
      return said ? `${name} (${said})` : name;
    });
    if (note)
      what.push(note.sentBack ? 'a note (it was sent back: say what you changed)' : 'a note');
    const then =
      parts.length === 0
        ? `Call handoff again${flag}.`
        : `Attach or fill them with otea attach ${id} / otea update ${id}, then call handoff again${flag}.`;
    return [`Not handed off ${id}: missing ${and(what)}.`, then].join('\n');
  }
  const lines: string[] = [];
  const waitingParts = missing.find(({ ref }) => ref === WAIT_PARTS);
  const waitingBlockers = missing.find(({ ref }) => ref === WAIT_BLOCKERS);
  if (waitingParts) {
    lines.push(
      `Not handed off ${id}: ${partsHold(id, waitingParts)}.`,
      `Nothing moves ${id} for them: hand it off again once they are ${DONE_NAME} or ${DROPPED_NAME}.`,
    );
  }
  if (waitingBlockers) {
    const hold = blockersHold(waitingBlockers);
    lines.push(
      `Not handed off ${id}: ${hold.text}.`,
      `Hand it off again once ${hold.them} ${hold.one ? 'is' : 'are'} ${DONE_NAME} or ${DROPPED_NAME}, or ask the person to remove the link.`,
    );
  }
  return lines.join('\n');
}

// The refusal of an approval whose waits no longer hold: a part reopened, or a blocker added.
export function approvalRefusalText(id: string, missing: readonly Missing[]): string {
  const sentences = missing.flatMap((wait) => {
    if (wait.ref === WAIT_PARTS) {
      const open = wait.open ?? [];
      const one = open.length === 1;
      return [
        `${and(named(open))} ${one ? 'was' : 'were'} reopened and ${one ? 'is' : 'are'} not finished`,
      ];
    }
    if (wait.ref === WAIT_BLOCKERS) return [blockersHold(wait).text];
    return [];
  });
  return `Not approved ${id}: ${sentences.join('; ')}.`;
}

// The refusal of a way back without a reason.
export const NOT_TAKEN_BACK = 'Not taken back: say why with --reason.';

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
    return `Created ${id} in ${name}: missing ${and(lacking.map(({ name: part }) => part))}. Fill them, then otea handoff ${id}.`;
  return `Created ${id} in ${name}.`;
}

// The refusal of a part created alone on a board whose items are always part of another's.
export function parentRequiredText(child: BoardDefinition, parent: BoardDefinition): string {
  return `Not created: a ${child.item} is always part of a ${parent.item}. Create it with --parent <the ${parent.item}'s id>.`;
}

// The refusal of a part on a board the parent does not divide into.
export function parentTypeText(
  parent: BoardDefinition,
  child: BoardDefinition,
  other: string,
  otherBoard: string,
): string {
  return `Not linked: the parts of a ${parent.item} are ${child.name}, and ${other} is on ${otherBoard}.`;
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

// What otea check answers for one item, in the board's words.
export function gateText(
  def: BoardDefinition,
  id: string,
  position: Position,
  action: GateAction,
  round: number,
): string {
  const answer = gateAt(def, position, action);
  const push = and(
    (guardedBranch(def)?.guard.push ?? []).flatMap((s) => stepById(def, s)?.name ?? []),
    'or',
  );
  const step = isClosed(position) ? undefined : stepById(def, position.step);
  const name = step?.name ?? '';
  switch (answer.why) {
    case 'unguarded':
      return `${action} allowed: ${def.name} protects no branch.`;
    case 'doing':
      return `push allowed: ${id} is being done in ${name}.`;
    case 'done':
      return `merge allowed: ${id} is ${DONE_NAME}.`;
    case 'review': {
      const who =
        step && isAgent(step.reviewer) && !isClosed(position) && position.phase === 'review'
          ? step.reviewer.agent
          : 'the person';
      return `push refused: ${id} waits for ${who} to review ${name}; its branch can be pushed only while ${push} is being done.`;
    }
    case 'not_push_step':
      return `push refused: ${id} is in ${name}; its branch can be pushed only while ${push} is being done.`;
    case 'closed':
      return `push refused: ${id} is ${closedName(def, position)}; nothing is pushed to a closed item's branch.`;
    case 'not_done':
      return isClosed(position)
        ? `merge refused: ${id} is ${closedName(def, position)}; its branch can be merged only once ${id} is ${DONE_NAME}.`
        : `merge refused: ${id} is in ${name}, round ${round}; its branch can be merged only once ${id} is ${DONE_NAME}.`;
  }
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
  const where = isClosed(position)
    ? `is ${closedName(def, position)}`
    : `is in ${stepById(def, position.step)?.name ?? ''}, round ${round}`;
  return `${action} refused: ${id} ${where}; ${base} takes its branch only once ${id} is ${DONE_NAME}.`;
}

// Why a push or merge into the protected base branch that brings in no item of the board is
// refused.
export function baseRefusal(def: BoardDefinition, action: GateAction, base: string): string {
  return `${action} refused: ${base} is the base branch ${def.name} protects; it takes only the branch of a ${def.item.trim() || 'item'} that is ${DONE_NAME}, and this ${action} brings in none.`;
}

// The line after a handoff, approval or send-back: where the item stands now.
export function handedText(def: BoardDefinition, id: string, to: Position): string {
  if (isClosed(to)) return `Handed off. ${id} is ${to.closed === DONE ? DONE_NAME : DROPPED_NAME}.`;
  const step = stepById(def, to.step);
  const name = step?.name ?? to.step;
  if (to.phase === 'doing') return `Handed off. ${id} moves on to ${name}.`;
  const who =
    to.phase === 'review' && step && isAgent(step.reviewer) ? step.reviewer.agent : 'the person';
  return `Handed off. ${id} waits for ${who} to review ${name}.`;
}

// What `next` answers when nothing on the board is the agent's: the board's own words for idle
// time, and the cap on new items when it is on.
export function idleText(def: BoardDefinition, waitingForYou: number): string {
  const lines = [`Nothing to do on ${def.name} right now.`];
  lines.push(...section('When there is nothing to do', indent(mentionText(def, def.idle))));
  if (def.cap.on) {
    const room = waitingForYou < def.cap.n;
    lines.push(
      ...section('New items', [
        room
          ? `  You may add items while fewer than ${def.cap.n} wait for the person (${waitingForYou} do).`
          : `  Do not add items: ${waitingForYou} already wait for the person (the cap is ${def.cap.n}).`,
      ]),
    );
  }
  return lines.join('\n');
}

function whoDoes(step: Step): string {
  if (step.doer === 'you') return 'the person does it';
  if (step.doer === 'any') return 'any agent does it';
  return `${step.doer.agent} does it`;
}

function whoReviews(step: Step): string {
  if (step.reviewer === 'none') return '';
  if (step.reviewer === 'you') return '; the person reviews it';
  return `; ${step.reviewer.agent} reviews it`;
}

// What `otea board` prints: the board's own words for agents (about it, idle time, the cap) and
// each step's instructions, mentions read with today's names.
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
