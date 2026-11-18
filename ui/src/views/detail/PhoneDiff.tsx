import { useEvidenceText } from '../../components/evidence/TextViews.tsx';
import { parseDiff } from '../../evidence.ts';
import { t } from '../../i18n/i18n.ts';
import type { Evidence } from '../../types.ts';

export type DiffSummary = {
  files: { path: string; additions: number; deletions: number }[];
  additions: number;
  deletions: number;
};

// What a diff changed, file by file: what a review on the phone shows of a code task before the
// diff is opened (P7-8: the phone showed no diff at all).
export function diffSummary(text: string): DiffSummary {
  const files = parseDiff(text)
    .filter((f) => f.path !== '')
    .map(({ path, additions, deletions }) => ({ path, additions, deletions }));
  return {
    files,
    additions: files.reduce((n, f) => n + f.additions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
  };
}

// The files a diff changed, under it in the round's files; a tap opens the diff in the reader.
export function PhoneDiffFiles({ evidence, onOpen }: { evidence: Evidence; onOpen: () => void }) {
  const state = useEvidenceText(evidence);
  if (state.status !== 'ready') return null;
  const sum = diffSummary(state.text);
  if (sum.files.length === 0) return null;
  return (
    <button
      type="button"
      className="p-diff"
      aria-label={t('phone.r.diffOpen', { file: evidence.filename })}
      onClick={onOpen}
    >
      <span className="p-diff-head">
        {t('phone.r.diffFiles', { count: sum.files.length })}
        <span className="p-diff-n">
          <span className="add">+{sum.additions}</span>{' '}
          <span className="del">−{sum.deletions}</span>
        </span>
      </span>
      <ul>
        {sum.files.map((f) => (
          <li key={f.path}>
            <span className="fn">{f.path}</span>
            <span className="p-diff-n">
              <span className="add">+{f.additions}</span>{' '}
              <span className="del">−{f.deletions}</span>
            </span>
          </li>
        ))}
      </ul>
    </button>
  );
}
