// Android's Back (and a browser's) on a sheet open on the phone: it closes the sheet, never leaves
// the page under it (DR3-12). Opening the sheet adds one entry to the history at the same address,
// so no route changes; Back takes it off and closes the sheet. A sheet closed any other way takes
// its own entry off again, so the history is as it was. Sheets over sheets each hold one entry:
// Back closes the one on top.

export type BackWindow = Pick<
  Window,
  'history' | 'location' | 'addEventListener' | 'removeEventListener'
>;

const KEY = 'oteaSheet';

// How many sheets the entry shown now holds: 0 on an entry no sheet added.
function depthOf(state: unknown): number {
  const depth = state && typeof state === 'object' ? (state as Record<string, unknown>)[KEY] : 0;
  return typeof depth === 'number' ? depth : 0;
}

export function holdBack(onBack: () => void, win: BackWindow = window): () => void {
  const depth = depthOf(win.history.state) + 1;
  win.history.pushState({ [KEY]: depth }, '', win.location.href);
  let held = true;
  const stop = () => {
    held = false;
    win.removeEventListener('popstate', onPop);
  };
  // Back, or any move to an entry under this sheet's: the sheet goes.
  function onPop() {
    if (!held || depthOf(win.history.state) >= depth) return;
    stop();
    onBack();
  }
  win.addEventListener('popstate', onPop);
  return () => {
    if (!held) return;
    stop();
    if (depthOf(win.history.state) === depth) win.history.back();
  };
}
