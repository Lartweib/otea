import { createContext, useContext } from 'react';
import type { Evidence } from '../../types.ts';

// Every file the open item holds, over all its rounds: a viewer reads the earlier version of the
// file it shows from here (a test report against the run before). Empty outside an item.
export const ItemEvidence = createContext<readonly Evidence[]>([]);

// The version of `evidence` handed before it: the latest earlier file of the same name, or none.
export function earlierOf(all: readonly Evidence[], evidence: Evidence): Evidence | undefined {
  return all
    .filter(
      (e) =>
        e.id !== evidence.id &&
        e.filename === evidence.filename &&
        e.createdAt < evidence.createdAt,
    )
    .sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id,
    )[0];
}

export function useEarlier(evidence: Evidence): Evidence | undefined {
  return earlierOf(useContext(ItemEvidence), evidence);
}
