import type { Profile } from '../profile.ts';
import { timeText } from '../time.ts';

// Notes from the person while an agent does a step (in-flight notes): the person leaves one without
// moving the item (no new step, round or lease), optionally on a piece of evidence already attached
// in the round; the agent reads it in the answers it already asks for (heartbeat, show, next,
// attach) and answers it with otea reply. A handoff waits until every note of the round is
// answered. The thread is the item's note_left and note_answered events; this module reads it and
// writes what agents read of it, in English, as the rest of what agents read (core/board/next.ts).

export const NOTE_LEFT = 'note_left';
export const NOTE_ANSWERED = 'note_answered';
// A review comment the person changed or took back while the review was still open (P5-3).
export const NOTE_EDITED = 'note_edited';
export const NOTE_WITHDRAWN = 'note_withdrawn';

// The piece of evidence a note is on: the very file the person saw (its evidence id, so a later
// file attached in its place leaves the note on the one seen), its name and part then, and for a
// recording, the moment in it; in a text, the line (its number when the viewer numbers it, and its
// text as seen); in a diagram, the node by its label; in an image, a point (x, y) or a zone (x, y,
// w, h), in percent of the image from its top left corner, to a tenth.
export type NoteAnchor = {
  evidence: number;
  filename: string;
  part?: string;
  partName?: string;
  seconds?: number;
  line?: number;
  quote?: string;
  // The quote is a whole paragraph of a document, not a phrase of it (P5-R2-8).
  whole?: true;
  node?: string;
  // In a PDF, the page (from 1) the point or zone is on (P5-6).
  page?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

// `profile`: the one the agent had declared when it answered (every event keeps it).
export type NoteAnswer = { text: string; at: string; by: string; profile?: Profile };

// A note and the moment it was left in: the step (by id and by name then), its round, how many of
// the step's required handoff deliverables were in (the handoff note not counted), the agent
// working then (`to`), and the anchor. `answer` once the agent answered.
export type ItemNote = {
  note: number;
  text: string;
  at: string;
  by: string;
  step: string;
  stepName: string;
  round: number;
  delivered: { done: number; of: number };
  to?: string;
  anchor?: NoteAnchor;
  answer?: NoteAnswer;
  // A comment left while the person reviewed the round: it goes with a send-back, as a note of the
  // round it starts (`for`, that step and round), which the agent answers like any other; when the
  // person approves, it stays a note of the round reviewed, and nobody has to answer it.
  review?: { for: { step: string; round: number } };
};

export type NoteEvent = {
  type: string;
  actor: { kind: 'human' | 'agent'; name: string };
  at: string;
  data: Record<string, unknown>;
  profile?: Profile;
};

function anchorOf(value: unknown): NoteAnchor | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.evidence !== 'number' || typeof raw.filename !== 'string') return undefined;
  return {
    evidence: raw.evidence,
    filename: raw.filename,
    ...(typeof raw.part === 'string' ? { part: raw.part } : {}),
    ...(typeof raw.partName === 'string' ? { partName: raw.partName } : {}),
    ...(typeof raw.seconds === 'number' ? { seconds: raw.seconds } : {}),
    ...(typeof raw.line === 'number' ? { line: raw.line } : {}),
    ...(typeof raw.quote === 'string' ? { quote: raw.quote } : {}),
    ...(raw.whole === true ? { whole: true as const } : {}),
    ...(typeof raw.node === 'string' ? { node: raw.node } : {}),
    ...(typeof raw.page === 'number' ? { page: raw.page } : {}),
    ...(typeof raw.x === 'number' ? { x: raw.x } : {}),
    ...(typeof raw.y === 'number' ? { y: raw.y } : {}),
    ...(typeof raw.w === 'number' ? { w: raw.w } : {}),
    ...(typeof raw.h === 'number' ? { h: raw.h } : {}),
  };
}

function reviewOf(value: unknown): { review?: { for: { step: string; round: number } } } {
  const step = (value as { for?: { step?: unknown } } | null)?.for?.step;
  const round = (value as { for?: { round?: unknown } } | null)?.for?.round;
  return typeof step === 'string' && typeof round === 'number'
    ? { review: { for: { step, round } } }
    : {};
}

// The notes of a step's round: those left in it and the review comments sent back into it.
export function notesOfRound(
  thread: readonly ItemNote[],
  step: string | undefined,
  round: number,
): ItemNote[] {
  return thread.filter(
    (note) =>
      (note.step === step && note.round === round) ||
      (note.review !== undefined &&
        note.review.for.step === step &&
        note.review.for.round === round),
  );
}

function deliveredOf(value: unknown): { done: number; of: number } {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    done: typeof raw.done === 'number' ? raw.done : 0,
    of: typeof raw.of === 'number' ? raw.of : 0,
  };
}

// The item's notes, oldest first, each with its answer once there is one.
export function notesOf(events: readonly NoteEvent[]): ItemNote[] {
  const notes = new Map<number, ItemNote>();
  for (const { type, actor, at, data, profile } of events) {
    if (typeof data.note !== 'number') continue;
    if (type === NOTE_LEFT) {
      const anchor = anchorOf(data.anchor);
      notes.set(data.note, {
        note: data.note,
        text: String(data.text ?? ''),
        at,
        by: actor.name,
        step: String(data.step ?? ''),
        stepName: String(data.stepName ?? data.step ?? ''),
        round: typeof data.round === 'number' ? data.round : 1,
        delivered: deliveredOf(data.delivered),
        ...(typeof data.to === 'string' ? { to: data.to } : {}),
        ...(anchor ? { anchor } : {}),
        ...reviewOf(data.review),
      });
    } else if (type === NOTE_EDITED) {
      const left = notes.get(data.note);
      if (left && !left.answer) left.text = String(data.text ?? left.text);
    } else if (type === NOTE_WITHDRAWN) {
      notes.delete(data.note);
    } else if (type === NOTE_ANSWERED) {
      const left = notes.get(data.note);
      if (!left || left.answer) continue;
      left.answer = {
        text: String(data.text ?? ''),
        at,
        by: actor.name,
        ...(profile
          ? { profile: { harness: profile.harness, model: profile.model, effort: profile.effort } }
          : {}),
      };
    }
  }
  return [...notes.values()];
}

// The numbers of the notes still unanswered.
export function unansweredOf(notes: readonly ItemNote[]): number[] {
  return notes.filter(({ answer }) => !answer).map(({ note }) => note);
}

function and(words: readonly string[]): string {
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

function numbered(ns: readonly number[]): string {
  return ns.length === 1 ? `note ${ns[0]}` : `notes ${and(ns.map(String))}`;
}

const ANSWER = '"<your short answer>"';

function replyCommand(id: string, n: number): string {
  return `otea reply ${id} --note ${n} ${ANSWER}`;
}

// The note as quoted: its first line opens the quote, later lines indented under it.
function quoted(text: string, indent: string): string[] {
  const [first = '', ...rest] = text.trim().split(/\r?\n/);
  const lines = [`"${first}`, ...rest.map((line) => `${indent}${line}`)];
  lines[lines.length - 1] += '"';
  return lines;
}

// An answered note is said in one line, cut here.
const BRIEF = 60;

function brief(text: string): string {
  const first = text.trim().split(/\r?\n/)[0] ?? '';
  return first.length <= BRIEF ? first : `${first.slice(0, BRIEF - 1).trimEnd()}…`;
}

// A moment in a recording as m:ss, "1:02", with its tenth of a second when it has one, "1:02.4":
// in a clip of a few seconds, whole seconds would say little.
export function moment(seconds: number): string {
  const tenths = Math.max(0, Math.round(seconds * 10));
  const whole = Math.floor(tenths / 10);
  const tenth = tenths % 10 ? `.${tenths % 10}` : '';
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}${tenth}`;
}

// "on pausa.gif at 0:02", or "on ui/PauseMenu.tsx (Diff)" with the part's name.
function onText(anchor: NoteAnchor, withPart: boolean, crop?: string): string {
  const part = withPart && anchor.partName ? ` (${anchor.partName})` : '';
  const at = anchor.seconds === undefined ? '' : ` at ${moment(anchor.seconds)}`;
  const quote = anchor.quote === undefined ? '' : `"${anchor.quote}"`;
  const line =
    anchor.line !== undefined
      ? ` at line ${anchor.line}${quote ? `: ${quote}` : ''}`
      : quote
        ? ` at the line ${quote}`
        : '';
  const node = anchor.node === undefined ? '' : ` at node "${anchor.node}"`;
  // A PDF's zone is read on its page; otea crop cuts images only.
  const page = anchor.page === undefined ? '' : ` on page ${anchor.page}`;
  const spot = spotText(anchor, anchor.page === undefined ? crop : undefined);
  return `on ${anchor.filename}${part}${at}${line}${node}${page}${spot}`;
}

const pct = (n: number) => `${Math.round(n * 10) / 10}`;

// " at the point x 34.2%, y 61.8% (from the top left)", or a zone with the command that cuts it out.
function spotText(anchor: NoteAnchor, crop?: string): string {
  const { x, y, w, h } = anchor;
  if (x === undefined || y === undefined) return '';
  if (w === undefined || h === undefined)
    return ` at the point x ${pct(x)}%, y ${pct(y)}% (from the top left)`;
  const cut = crop ? `; ${crop} cuts it out` : '';
  return ` at the zone x ${pct(x)}–${pct(x + w)}%, y ${pct(y)}–${pct(y + h)}% (from the top left${cut})`;
}

// What was in when the note was left: where, when, and how many deliverables.
function contextText(note: ItemNote): string {
  const said = [
    ...(note.anchor ? [onText(note.anchor, true)] : []),
    timeText(note.at),
    ...(note.delivered.of > 0
      ? [`when you had ${note.delivered.done} of ${note.delivered.of} handoff deliverables`]
      : []),
  ];
  return said.join(', ');
}

// At most this many answered notes are listed in next and show; the rest are counted.
const ANSWERED_SHOWN = 3;

// next's and show's block, when the round has notes: every unanswered note whole, with the command
// that answers it, and the newest answered ones in a line each; newest first.
export function notesBlock(id: string, notes: readonly ItemNote[], me?: string): string[] {
  if (notes.length === 0) return [];
  const open = unansweredOf(notes).length;
  const head = `Notes from the person: ${notes.length}, ${open === 0 ? 'all answered' : `${open} unanswered`}`;
  const lines = [head];
  const newest = [...notes].reverse();
  let answeredShown = 0;
  for (const note of newest) {
    if (note.answer) {
      answeredShown += 1;
      if (answeredShown > ANSWERED_SHOWN) continue;
      const who = note.answer.by === me ? 'you' : note.answer.by;
      const on = note.anchor
        ? `${onText(note.anchor, false, `otea crop ${id} --note ${note.note}`)} · `
        : '';
      lines.push(
        `  ${note.note} · "${brief(note.text)}"`,
        `      ${on}${who} answered ${timeText(note.answer.at)}`,
      );
      continue;
    }
    const on = note.anchor
      ? `${onText(note.anchor, false, `otea crop ${id} --note ${note.note}`)} · `
      : '';
    const [first = '', ...rest] = quoted(note.text, '      ');
    lines.push(
      `  ${note.note} · ${first}`,
      ...rest,
      `      ${on}unanswered: ${replyCommand(id, note.note)}`,
    );
  }
  const hidden = answeredShown - ANSWERED_SHOWN;
  if (hidden > 0) lines.push(`  and ${hidden} earlier, answered`);
  return lines;
}

// What a heartbeat or an attach adds while notes wait for an answer: each with the moment it was
// left in, and the command that answers it. Empty when none waits.
export function newNotesText(id: string, notes: readonly ItemNote[]): string {
  const open = notes.filter(({ answer }) => !answer);
  const keep = 'the step, round and lease stay as they are:';
  if (open.length === 0) return '';
  if (open.length === 1) {
    const [note] = open as [ItemNote];
    return [
      `New note from the person (note ${note.note}, unanswered):`,
      ...quoted(note.text, '  ').map((line, index) => (index === 0 ? `  ${line}` : line)),
      `  ${contextText(note)}`,
      `Answer it before you hand off; ${keep}`,
      `  ${replyCommand(id, note.note)}`,
    ].join('\n');
  }
  return [
    `New notes from the person (${open.length} unanswered):`,
    ...open.flatMap((note) => [
      ...quoted(note.text, '    ').map((line, index) =>
        index === 0 ? `  Note ${note.note}: ${line}` : line,
      ),
      `    ${contextText(note)}`,
    ]),
    `Answer each before you hand off; ${keep}`,
    ...open.map((note) => `  ${replyCommand(id, note.note)}`),
  ].join('\n');
}

// The Handoff checklist's line for the notes of the round, when it has any.
export function notesHandLine(notes: readonly ItemNote[]): string[] {
  if (notes.length === 0) return [];
  const open = unansweredOf(notes);
  const line = '  Notes from the person answered: required';
  if (open.length === 0) return [`  ✓${line.slice(1)}`];
  const verb = open.length === 1 ? 'is' : 'are';
  return [`  ✗${line.slice(1)} (${numbered(open)} ${verb} not)`];
}

// The refusal of a handoff while notes wait for an answer: which, and the command for the first.
export function notesRefusal(id: string, open: readonly number[]): string[] {
  if (open.length === 0) return [];
  const [first = 0, ...rest] = open;
  if (rest.length === 0)
    return [
      `Not handed off ${id}: note ${first} from the person is unanswered.`,
      `Answer it first: ${replyCommand(id, first)}`,
    ];
  return [
    `Not handed off ${id}: ${numbered(open)} from the person are unanswered.`,
    `Answer each first: ${replyCommand(id, first)} (then ${rest.map((n) => `--note ${n}`).join(', ')})`,
  ];
}

// The refusal of a set-aside for later while notes wait for an answer (P7-R3-8): the person may
// have asked for the item now; the first note in brief, and the command that answers it.
export function laterNotesRefusal(id: string, open: readonly ItemNote[]): string {
  const [first, ...rest] = open;
  if (!first) return '';
  const which =
    rest.length === 0
      ? `note ${first.note} from the person is unanswered`
      : `${numbered(open.map(({ note }) => note))} from the person are unanswered`;
  const each = rest.length === 0 ? 'it' : 'each';
  return `Not set aside ${id}: ${which} ("${brief(first.text)}"). Answer ${each} first: ${replyCommand(id, first.note)}`;
}

// The line after otea reply: what is still unanswered, or that the item may be handed off.
export function repliedText(id: string, n: number, open: readonly number[]): string {
  const head = `Answered note ${n} on ${id}.`;
  if (open.length === 0) return `${head} Nothing left unanswered: you may hand it off.`;
  const [first = 0] = open;
  return `${head} Still unanswered: ${numbered(open)} (${replyCommand(id, first)}).`;
}

// What otea wait says when a note wakes it: each note in the person's words too, as an agent woken
// by a number alone acted without reading it (P7-R3-8).
export function waitNoteText(id: string, open: readonly ItemNote[]): string {
  const one = open.length === 1;
  const ns = open.map(({ note }) => note);
  return [
    `${id}: new ${one ? 'note' : 'notes'} from the person (${numbered(ns)}). Read ${one ? 'it' : 'them'}: otea show ${id}`,
    ...open.flatMap(({ note, text }) => {
      const [first = '', ...rest] = quoted(text, '      ');
      return [`  ${note} · ${first}`, ...rest];
    }),
  ].join('\n');
}
