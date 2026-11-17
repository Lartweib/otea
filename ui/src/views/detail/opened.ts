import { useEffect, useState } from 'react';
import { fetchOpened, postOpened } from '../../api.ts';

// The files of an item the person opened in the reader, on the desk or the phone (app/opened.ts):
// what Aprobar counts as left unopened holds after a reload and from one device to another. A file
// opened here counts at once; what the PC says back adds the ones opened elsewhere.

export type Opened = { item: string; ids: ReadonlySet<number> };

const NONE: ReadonlySet<number> = new Set();

export function openedFor(opened: Opened, item: string): ReadonlySet<number> {
  return opened.item === item ? opened.ids : NONE;
}

export function withOpened(opened: Opened, item: string, id: number): Opened {
  const ids = openedFor(opened, item);
  return ids.has(id) && opened.item === item ? opened : { item, ids: new Set([...ids, id]) };
}

export function withHeard(opened: Opened, item: string, heard: readonly number[]): Opened {
  return { item, ids: new Set([...openedFor(opened, item), ...heard]) };
}

// The item's opened files and the way to count one; `write` false (a read-only device) keeps the
// count on this page only.
export function useOpened(
  item: string,
  write: boolean,
): [ReadonlySet<number>, (id: number) => void] {
  const [opened, setOpened] = useState<Opened>({ item, ids: NONE });
  useEffect(() => {
    const abort = new AbortController();
    fetchOpened(item, abort.signal).then(
      (heard) => setOpened((was) => withHeard(was, item, heard)),
      () => undefined,
    );
    return () => abort.abort();
  }, [item]);
  const ids = openedFor(opened, item);
  const mark = (id: number) => {
    if (ids.has(id)) return;
    setOpened((was) => withOpened(was, item, id));
    if (write) void postOpened(item, id).catch(() => undefined);
  };
  return [ids, mark];
}
