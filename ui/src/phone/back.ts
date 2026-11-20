import { PHONE_QUERY } from '../hooks.ts';

// Android's Back (and a browser's) on a sheet open on the phone: it closes the sheet, never leaves
// the page under it (DR3-12). Opening the sheet adds one entry to the history at the same address,
// so no route changes; Back takes it off and closes the sheet. A sheet closed any other way takes
// its own entry off again, so the history is as it was. Sheets over sheets each hold one entry:
// Back closes the one on top.

export type BackWindow = Pick<
  Window,
  'history' | 'location' | 'addEventListener' | 'removeEventListener'
>;

export type PhoneWindow = BackWindow & { matchMedia(query: string): { matches: boolean } };

const KEY = 'oteaSheet';
// Which sheet added the entry.
const ID = 'oteaSheetId';

// How many sheets the entry shown now holds: 0 on an entry no sheet added.
function depthOf(state: unknown): number {
  const depth = state && typeof state === 'object' ? (state as Record<string, unknown>)[KEY] : 0;
  return typeof depth === 'number' ? depth : 0;
}

const idOf = (state: unknown): unknown =>
  state && typeof state === 'object' ? (state as Record<string, unknown>)[ID] : undefined;

let made = 0;
const newId = () => `${Date.now().toString(36)}.${++made}`;

// The Backs a sheet closed another way asked for, which the browser has not made yet: it makes
// them after the task that asked. A sheet opened meanwhile (Preferencias, from the nav sheet that
// just went) adds its entry once they have landed; added before, that Back would take it off and
// close it at once, and the next Back would leave the page (P7-R3-12).
type Owed = { backs: number; waiting: (() => void)[] };
const owedBy = new WeakMap<BackWindow, Owed>();

function owedOf(win: BackWindow): Owed {
  let owed = owedBy.get(win);
  if (!owed) {
    owed = { backs: 0, waiting: [] };
    owedBy.set(win, owed);
  }
  return owed;
}

function goBack(win: BackWindow): void {
  const owed = owedOf(win);
  owed.backs += 1;
  const landed = () => {
    win.removeEventListener('popstate', landed);
    owed.backs -= 1;
    if (owed.backs > 0) return;
    for (const run of owed.waiting.splice(0)) run();
  };
  win.addEventListener('popstate', landed);
  win.history.back();
}

// A sheet closed while its entry is not the one shown: a row took the page elsewhere (the nav
// sheet's boards, Preferencias' «Teléfono, en Configuración…»), or a sheet over it is still open.
// Its entry stays in the history, at the address of the page under it. Back lands there one day:
// it goes on past it, or that Back showed the page and the next one did nothing (P7-R3-12).
function skipWhenShown(win: BackWindow, id: string): void {
  const shown = () => {
    if (idOf(win.history.state) !== id) return;
    win.removeEventListener('popstate', shown);
    goBack(win);
  };
  win.addEventListener('popstate', shown);
}

export function holdBack(onBack: () => void, win: BackWindow = window): () => void {
  const id = newId();
  let held = true;
  let depth = 0;
  let href = '';
  const stop = () => {
    held = false;
    win.removeEventListener('popstate', onPop);
  };
  // Back, or any move to an entry under this sheet's: the sheet goes. A browser fires popstate on
  // a change of address too (a row that takes you somewhere): the sheet goes, and its entry stays
  // under the new one, at the old address.
  function onPop() {
    if (!held || depth === 0 || depthOf(win.history.state) >= depth) return;
    stop();
    if (win.location.href !== href) skipWhenShown(win, id);
    onBack();
  }
  const add = () => {
    if (!held) return;
    depth = depthOf(win.history.state) + 1;
    href = win.location.href;
    win.history.pushState({ [KEY]: depth, [ID]: id }, '', href);
    win.addEventListener('popstate', onPop);
  };
  const owed = owedOf(win);
  if (owed.backs > 0) owed.waiting.push(add);
  else add();
  return () => {
    if (!held) return;
    stop();
    if (depth === 0) return;
    if (idOf(win.history.state) === id) goBack(win);
    else skipWhenShown(win, id);
  };
}

// A pop or a dialog holds Back the same way, on the phone only: on the desk, Back stays the
// browser's (P7-R3-12).
export function holdBackOnPhone(onBack: () => void, win: PhoneWindow = window): () => void {
  if (typeof win.matchMedia !== 'function' || !win.matchMedia(PHONE_QUERY).matches) return () => {};
  return holdBack(onBack, win);
}
