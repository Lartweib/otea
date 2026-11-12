import { backTarget, isClosed, type Missing, type Position, startsWith, waysOf } from './engine.ts';
import { mentionText } from './mentions.ts';
import {
  type BoardDefinition,
  DONE,
  type Hand,
  isAgent,
  isEvidence,
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
  return waysOf(def, stepId).find((target) => {
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
};

function whenText(def: BoardDefinition, hand: Hand): string {
  if (!hand.when) return 'required sometimes';
  const read = partOf(def, hand.when.part);
  const value = read?.options.find(({ id }) => id === hand.when?.value)?.name ?? hand.when.value;
  return `required when ${read?.name ?? '…'} is ${value}`;
}

function handLines(def: BoardDefinition, hands: readonly Hand[], input: NextInput): string[] {
  if (hands.length === 0) return ['  nothing required'];
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
    const line = `  ${mark} ${part.name}: ${req}${missing ? ` (${REASON[missing.reason]})` : ''}`;
    return part.hint && hand.req !== 'no' ? [line, `      what goes here: ${part.hint}`] : [line];
  });
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

export function nextText(def: BoardDefinition, input: NextInput): string {
  const { position, id } = input;
  if (isClosed(position)) {
    const name = position.closed === DONE ? DONE_NAME : DROPPED_NAME;
    return `${id} · ${def.item} · ${name}\nClosed: nothing left to do.`;
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
  lines.push(...section('About this board', indent(mentionText(def, def.about))));
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
  const instruction = reviewing ? step.instructions.review : step.instructions.take;
  lines.push(
    ...section(
      reviewing ? 'When you review it' : 'When you take it',
      indent(mentionText(def, instruction)),
    ),
  );
  lines.push(...section('Handoff', handLines(def, step.hand, input)));
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
  lines.push(...section('Next', [`  ${after}`]));

  const choice = `"<${names.join('|')}>"`;
  const finish = reviewing
    ? [
        `  otea approve ${id}${several ? ` --way ${choice}` : ''}`,
        `  otea send-back ${id} --reason "what to change"`,
      ]
    : [
        `  otea handoff ${id}${several && step.reviewer === 'none' ? ` --way ${choice} --reason "why"` : ''}`,
      ];
  lines.push(...section('When you finish', finish));
  return lines.join('\n');
}

const MISSING_NOTE: Readonly<Record<Missing['reason'], string>> = {
  missing: '',
  not_new: 'new this round',
  unchecked: 'every box ticked',
};

// The exact refusal of a handoff that lacks something.
export function refusalText(id: string, missing: readonly Missing[]): string {
  const what = missing.map(({ name, reason, fresh }) => {
    const note = reason === 'missing' && fresh ? 'new this round' : MISSING_NOTE[reason];
    return note ? `${name} (${note})` : name;
  });
  return [
    `Not handed off ${id}: missing ${and(what)}.`,
    `Attach or fill them with otea attach ${id} / otea update ${id}, then call handoff again.`,
  ].join('\n');
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
