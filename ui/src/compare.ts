import type { Move } from './types.ts';

// Comparing two rounds: which round is A and which is B, how they are laid over each other, and one
// clock that both follow, stepped a frame at a time. Marks pin frames to the feedback.

export type CompareMode = 'side' | 'slider' | 'onion' | 'difference';

export const COMPARE_MODES: readonly CompareMode[] = ['side', 'slider', 'onion', 'difference'];

export type Pins = { a: number; b: number };

// Pins a round as A or B. Pinning the round the other side holds swaps them, so A and B always
// show two different rounds.
export function pin(pins: Pins, role: 'a' | 'b', round: number): Pins {
  const other = role === 'a' ? 'b' : 'a';
  if (pins[role] === round) return pins;
  if (pins[other] === round) return { a: pins.b, b: pins.a };
  return { ...pins, [role]: round };
}

export const swap = ({ a, b }: Pins): Pins => ({ a: b, b: a });

// The clock counts frames at a fixed rate: a recording carries no frame rate the browser reads, so
// a frame is a 24th of a second.
export const FPS = 24;

export const frameAt = (seconds: number, fps = FPS) => Math.max(0, Math.round(seconds * fps));

export const timeOf = (frame: number, fps = FPS) => frame / fps;

// One frame back or forward, wrapping at both ends of `count` frames, as a loop does.
export function stepFrame(frame: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((frame + delta) % count) + count) % count;
}

export function toggleMark(marks: readonly number[], frame: number): number[] {
  return marks.includes(frame)
    ? marks.filter((mark) => mark !== frame)
    : [...marks, frame].sort((a, b) => a - b);
}

export const frameLabel = (frame: number) => `f ${String(frame).padStart(2, '0')}`;

// The feedback a send-back carries: the note, then the frames marked on the clock.
export function feedbackOf(note: string, marks: readonly number[], marked: string): string {
  const text = note.trim();
  if (marks.length === 0) return text;
  const line = `${marked} ${marks.map(frameLabel).join(', ')}`;
  return text === '' ? line : `${text}\n\n${line}`;
}

// The two verdicts the human gives in place: the move that closes the item as done, and the move
// that hands it back to the agent with feedback.
export function verdictMoves(moves: readonly Move[]): { approve?: Move; sendBack?: Move } {
  const approve = moves.find((move) => move.closes === 'done' && move.by !== 'agent');
  const sendBack = moves.find((move) => move.turn === 'agent' && move.by !== 'agent');
  return { ...(approve ? { approve } : {}), ...(sendBack ? { sendBack } : {}) };
}
