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

export type FileChange = { name: string; kind: Evidence['kind']; change: 'new' | 'gone' | 'same' };

// From one round's files to the next, by name: what came new, what stayed, what is gone.
export function compareFiles(older: readonly Evidence[], newer: readonly Evidence[]): FileChange[] {
  const was = new Set(older.map((e) => e.filename));
  const now = new Set(newer.map((e) => e.filename));
  const of = (e: Evidence, change: FileChange['change']): FileChange => ({
    name: e.filename,
    kind: e.kind,
    change,
  });
  return [
    ...newer.filter((e) => !was.has(e.filename)).map((e) => of(e, 'new')),
    ...newer.filter((e) => was.has(e.filename)).map((e) => of(e, 'same')),
    ...older.filter((e) => !now.has(e.filename)).map((e) => of(e, 'gone')),
  ];
}
