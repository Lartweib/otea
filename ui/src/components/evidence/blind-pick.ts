import { t } from '../../i18n/i18n.ts';
import type { ItemNote } from '../../views/detail/notes.ts';

// Picking A or B on a blind compare (P5-4): the pick is a comment of the review on the file
// picked, so it goes with a send-back or stays a note of the round approved, and the agent that
// lands the piece reads which one the person kept.

const PICK = /^(Me quedo con|I pick) (A|B)\.$/;

export function pickNoteText(side: 'A' | 'B'): string {
  return t('compare.pickNote', { side });
}

// The pick comments of the review still open on the files given, by the file picked.
export function pickOf(
  left: readonly ItemNote[],
  ids: readonly number[],
  pending: (note: ItemNote) => boolean,
): ItemNote | undefined {
  return left.find(
    (n) =>
      n.anchor !== undefined && ids.includes(n.anchor.evidence) && PICK.test(n.text) && pending(n),
  );
}
