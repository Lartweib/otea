import { useSyncExternalStore } from 'react';
import { shellUi } from '../shell/shell-ui.ts';

// Whether the phone's nav sheet is open. The state is the shell's `nav` flag: the bottom bar's
// Panel tab toggles it, the sheet reads and closes it here.
export type NavSheetStore = {
  get(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  subscribe(fn: () => void): () => void;
};

export const navSheet: NavSheetStore = {
  get: () => shellUi.get().nav,
  open: () => shellUi.set({ nav: true }),
  close: () => shellUi.set({ nav: false }),
  toggle: () => shellUi.set({ nav: !shellUi.get().nav }),
  subscribe: (fn) => shellUi.subscribe(fn),
};

export function useNavSheet(): boolean {
  return useSyncExternalStore(navSheet.subscribe, navSheet.get, navSheet.get);
}
