import { moveBlock, moveVariants, type Waits } from './actions.ts';
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

// The two verdicts the human gives in place, read as the item's header reads them: the approving
// move (its primary, which may close the item or hand it on to an agent's next step), and the move
// that hands it back to an agent with feedback (one that asks a reason and closes nothing).
export function verdictMoves(
  moves: readonly Move[],
  waits?: Waits,
): { approve?: Move; sendBack?: Move } {
  const variants = moveVariants(moves, waits);
  const approve = moves.find((_, i) => variants[i] === 'primary');
  const sendBack = moves.find(
    (move) =>
      move.by !== 'agent' &&
      move.reasonRequired &&
      move.turn === 'agent' &&
      !move.closes &&
      moveBlock(move, waits) === undefined,
  );
  return { ...(approve ? { approve } : {}), ...(sendBack ? { sendBack } : {}) };
}
