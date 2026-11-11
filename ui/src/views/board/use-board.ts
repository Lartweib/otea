import { useCallback, useState } from 'react';
import {
  COLLAPSED_KEY,
  EXPANDED_KEY,
  type Folds,
  readCollapsed,
  writeCollapsed,
} from '../../nesting.ts';
import type { CollectionView } from '../../types.ts';
import { readViewPrefs, type ViewPrefs, writeViewPrefs } from '../../view-prefs.ts';

// The board's choices as this browser remembers them (view-prefs.ts), and the folds of its trees.

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export function useBoardPrefs(
  collection: CollectionView | undefined,
): [ViewPrefs | undefined, (next: Partial<ViewPrefs>) => void] {
  const name = collection?.name ?? '';
  const [chosen, setChosen] = useState<Record<string, ViewPrefs>>({});
  const prefs = collection ? (chosen[name] ?? readViewPrefs(storage(), collection)) : undefined;
  const set = useCallback(
    (next: Partial<ViewPrefs>) => {
      if (!collection) return;
      writeViewPrefs(storage(), collection.name, next);
      setChosen((all) => {
        const base = all[collection.name] ?? readViewPrefs(storage(), collection);
        return { ...all, [collection.name]: { ...base, ...next } };
      });
    },
    [collection],
  );
  return [prefs, set];
}

export function useFolds(): [Folds, (next: Folds) => void] {
  const [folds, setFolds] = useState<Folds>(() => ({
    collapsed: readCollapsed(storage(), COLLAPSED_KEY),
    expanded: readCollapsed(storage(), EXPANDED_KEY),
  }));
  const set = useCallback((next: Folds) => {
    writeCollapsed(storage(), next.collapsed, COLLAPSED_KEY);
    writeCollapsed(storage(), next.expanded, EXPANDED_KEY);
    setFolds(next);
  }, []);
  return [folds, set];
}
