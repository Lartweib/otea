import { t } from '../../i18n/i18n.ts';
import type { Round } from '../../rounds.ts';
import type { Evidence } from '../../types.ts';

// Reviewing an item on the phone (mobile mock 2): the rounds of the step under review as one
// segmented control, newest first, each with what the agent delivered, its evidence and what you
// asked of it the round before. The rounds are read by rounds.ts, which numbers them as the step
// engine does (core/board/history.ts): nothing is counted here.

// How a round ended: still yours to judge, sent back, approved, closed; null while it is not.
export type RoundTag = 'yours' | 'sentBack' | 'approved' | 'closed' | null;

export type PhoneRound = {
  n: number;
  by: string;
  at: string;
  note?: string;
  evidence: Evidence[];
  tag: RoundTag;
  // Your note when you sent this round back.
  reason?: string;
  // What you asked of it: your note on the round before.
  asked?: { n: number; text: string };
};

const TAG = { 'sent-back': 'sentBack', approved: 'approved', closed: 'closed' } as const;

// yours: the item is on your turn, so the last round waits for your verdict.
export function phoneRounds(rounds: readonly Round[], yours: boolean): PhoneRound[] {
  return rounds
    .map((r, i): PhoneRound => {
      const before = rounds[i - 1];
      const asked = before?.verdict?.kind === 'sent-back' ? before.verdict.reason : undefined;
      const last = i === rounds.length - 1;
      const tag: RoundTag = r.verdict ? TAG[r.verdict.kind] : last && yours ? 'yours' : null;
      const reason = r.verdict?.kind === 'sent-back' ? r.verdict.reason : undefined;
      return {
        n: r.n,
        by: r.by.name,
        at: r.endedAt,
        ...(r.note ? { note: r.note } : {}),
        evidence: r.evidence,
        tag,
        ...(reason ? { reason } : {}),
        ...(asked && before ? { asked: { n: before.n, text: asked } } : {}),
      };
    })
    .reverse();
}

export function roundTagWord(tag: RoundTag): string {
  return tag ? t(`phone.r.${tag}`) : '';
}

export function splitEvidence(evidence: readonly Evidence[]): {
  images: Evidence[];
  files: Evidence[];
} {
  return {
    images: evidence.filter((e) => e.kind === 'image'),
    files: evidence.filter((e) => e.kind !== 'image'),
  };
}

export type FileChange = {
  name: string;
  kind: Evidence['kind'];
  change: 'new' | 'changed' | 'gone' | 'same';
};

// How a file of a round stands against the round before: new by name, changed when the name came
// again with other contents, the same when its contents did not change.
function changeOf(e: Evidence, was: ReadonlyMap<string, Evidence>): 'new' | 'changed' | 'same' {
  const old = was.get(e.filename);
  if (!old) return 'new';
  return old.sha256 === e.sha256 ? 'same' : 'changed';
}

// From one round's files to the next, by name: what came new, what changed, what stayed, what is
// gone.
export function compareFiles(older: readonly Evidence[], newer: readonly Evidence[]): FileChange[] {
  const was = new Map(older.map((e) => [e.filename, e]));
  const now = new Set(newer.map((e) => e.filename));
  const of = (e: Evidence, change: FileChange['change']): FileChange => ({
    name: e.filename,
    kind: e.kind,
    change,
  });
  const marked = newer.map((e) => of(e, changeOf(e, was)));
  return [
    ...marked.filter((c) => c.change === 'new'),
    ...marked.filter((c) => c.change !== 'new'),
    ...older.filter((e) => !now.has(e.filename)).map((e) => of(e, 'gone')),
  ];
}

// Each file of a round marked against the round before, by its id; nothing on a first round.
export function fileMarks(
  older: readonly Evidence[],
  newer: readonly Evidence[],
): Map<number, 'new' | 'changed' | 'same'> {
  if (older.length === 0) return new Map();
  const was = new Map(older.map((e) => [e.filename, e]));
  return new Map(newer.map((e) => [e.id, changeOf(e, was)]));
}

// Whether the phone docks "Dejar una nota" at the bottom: while an agent works on it, unless the
// item is stuck, where Retomar and Reasignar are what you need (a note to a gone agent waits).
export function notesDock(mode: string, canLeave: boolean): boolean {
  return canLeave && mode !== 'stuck';
}

// How many files of the round the person has not opened in the reader yet: Aprobar says so in one
// line, without holding the move.
export function unopenedOf(
  evidence: readonly { id: number }[],
  opened: ReadonlySet<number>,
): { unopened: number; total: number } {
  return {
    unopened: evidence.filter(({ id }) => !opened.has(id)).length,
    total: evidence.length,
  };
}
