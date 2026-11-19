import { useEffect, useState } from 'react';
import type { MergedOutside } from '../../../../src/cli/merged-outside.ts';
import { fetchMergedOutside } from '../../api.ts';

// An item merged by hand still read «un agente la integra en main ahora» on the desk (P1-R3-9):
// while it stands in its land step, the PC asks git whether its branch is in the base already, as
// the CLI does, and the branch line says so.

export type { MergedOutside };

// Whether the item's branch is in its base already, while `asking` (it stands in its land step);
// null otherwise, and while the PC has not answered. Asked again whenever the item changes (`at`).
export function useMergedOutside(item: string, asking: boolean, at: string): MergedOutside | null {
  const [merged, setMerged] = useState<{ item: string; merged: MergedOutside | null }>({
    item,
    merged: null,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: a change to the item asks again
  useEffect(() => {
    if (!asking) return;
    const abort = new AbortController();
    fetchMergedOutside(item, abort.signal).then(
      (heard) => setMerged({ item, merged: heard }),
      () => undefined,
    );
    return () => abort.abort();
  }, [item, asking, at]);
  return asking && merged.item === item ? merged.merged : null;
}
