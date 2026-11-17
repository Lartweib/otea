// A checklist that asks for proof, as the item page reads it (app/next.ts provedChecklists): each
// point ticked or not, with the proof it has in the round. Pure: the page and the phone draw it.

export type ProofView = {
  kind: 'file' | 'log' | 'test';
  evidence: number;
  file: string;
  line?: number;
  text?: string;
  test?: string;
};

export type ProofPoint = {
  id: string;
  name: string;
  ticked: boolean;
  proof?: ProofView;
};
export type ProofChecklistView = {
  part: string;
  name: string;
  points: ProofPoint[];
};

// What a point lacks: nothing, its proof (ticked without one), or its tick.
export type PointState = 'proved' | 'unproved' | 'unticked';

export function pointState(point: ProofPoint): PointState {
  if (!point.ticked) return 'unticked';
  return point.proof ? 'proved' : 'unproved';
}

// The footer's count: how many points are ticked, how many have their proof, of how many.
export function proofCount(list: ProofChecklistView): {
  ticked: number;
  proved: number;
  total: number;
} {
  const ticked = list.points.filter(({ ticked: on }) => on).length;
  const proved = list.points.filter((point) => pointState(point) === 'proved').length;
  return { ticked, proved, total: list.points.length };
}

// The proof as its chip says it: the file, the log's file and line, or the test.
export function proofLabel(proof: ProofView): string {
  if (proof.kind === 'log') return `${proof.file}:${proof.line ?? ''}`;
  if (proof.kind === 'test') return proof.test ?? proof.file;
  return proof.file;
}
