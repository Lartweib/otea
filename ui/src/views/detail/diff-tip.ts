import { useEffect, useState } from 'react';
import type { DiffOffTip } from '../../../../src/server/diff-tip.ts';
import { fetchDiffOffTip } from '../../api.ts';
import { listOf, t } from '../../i18n/i18n.ts';

// The attached diff of an item in review does not come from the tip handed off on its branch
// (P1-R3-1): the PC compares them (src/server/diff-tip.ts) and the page says so under the branch,
// before the person approves. Approving keeps the tip, not the diff.

export type { DiffOffTip };

// At most this many files are named; the rest are counted.
const NAMED = 3;

export function diffOffTipText(off: DiffOffTip): string {
  const more = off.files.length - NAMED;
  const named = off.files.slice(0, NAMED);
  const files = listOf(more > 0 ? [...named, t('bi.branch.diffOffMore', { count: more })] : named);
  return t('bi.branch.diffOff', {
    files,
    branch: off.branch,
    tip: off.tip,
    count: off.files.length,
  });
}

// Whether the attached diff is off the tip handed off, while `asking` (the item waits for the
// person's review); null otherwise, and while the PC has not answered. Asked again whenever the
// item changes (`at`).
export function useDiffOffTip(item: string, asking: boolean, at: string): DiffOffTip | null {
  const [off, setOff] = useState<{ item: string; off: DiffOffTip | null }>({ item, off: null });
  // biome-ignore lint/correctness/useExhaustiveDependencies: a change to the item asks again
  useEffect(() => {
    if (!asking) return;
    const abort = new AbortController();
    fetchDiffOffTip(item, abort.signal).then(
      (heard) => setOff({ item, off: heard }),
      () => undefined,
    );
    return () => abort.abort();
  }, [item, asking, at]);
  return asking && off.item === item ? off.off : null;
}
