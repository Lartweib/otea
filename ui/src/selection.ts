// Routes live in the hash (SPEC §6.2): `#/` Te toca, `#/atasco`, `#/b/<board>` a board, `#/triage`,
// `#/projects`, `#/settings`, `#/lan` (the pairing dialog over Te toca), `#/studio[/...]` (see
// StudioPage), `#/modules[/<name>]` and `#/brief/<id>,<id>`. An open item appends
// `/i/<id>` to Te toca, Atasco and a board (`#/b/Errores/i/ERR-214`; `#/i/ERR-214` on Te toca). A
// bare `#<id>`, the CLI's deep link, opens the item on Te toca. Item ids never start with a slash.
export type ViewRoute =
  | { view: 'toca' }
  | { view: 'atasco' }
  | { view: 'board'; board: string }
  | { view: 'triage' }
  | { view: 'projects' }
  | { view: 'settings' }
  | { view: 'lan' }
  | { view: 'studio'; page: StudioPage }
  | { view: 'modules'; name?: string }
  | { view: 'brief'; ids: string[] };

export type Route = ViewRoute & { item?: string };

// Studio's pages (ui/src/board-studio): its home (`#/studio`), and a board's editor by the
// board's hidden id (`#/studio/board/<id>`).
export type StudioPage = { kind: 'boards' } | { kind: 'board'; board: string };

const MODULES = '/modules';
const TRIAGE = '/triage';
const BRIEF = '/brief';
const STUDIO = '/studio';
const LAN = '/lan';
const PROJECTS = '/projects';
const SETTINGS = '/settings';

// LAN access: the pairing code for a phone and the paired devices.
export const LAN_HASH = `#${LAN}`;

// What waits for you in every project on this machine.
export const PROJECTS_HASH = `#${PROJECTS}`;

// The settings of the project this server serves: its paths, repos and storage.
export const SETTINGS_HASH = `#${SETTINGS}`;

// Swipe triage: what waits for you, one card at a time.
export const TRIAGE_HASH = `#${TRIAGE}`;

// Te toca with nothing open.
export const ITEMS_HASH = '#/';

function decode(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
}

export function idFromHash(hash: string): string | undefined {
  return decode(hash.replace(/^#/, '')) || undefined;
}

export function hashFor(id: string): string {
  return `#${encodeURIComponent(id)}`;
}

export function routeFromHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === MODULES || path.startsWith(`${MODULES}/`)) {
    const name = decode(path.slice(MODULES.length + 1));
    return name ? { view: 'modules', name } : { view: 'modules' };
  }
  if (path === TRIAGE) return { view: 'triage' };
  if (path === BRIEF || path.startsWith(`${BRIEF}/`)) {
    const ids = path
      .slice(BRIEF.length + 1)
      .split(',')
      .map(decode)
      .filter((id): id is string => !!id);
    return { view: 'brief', ids };
  }
  if (path === STUDIO || path.startsWith(`${STUDIO}/`)) {
    return { view: 'studio', page: studioPage(path.slice(STUDIO.length + 1).split('/')) };
  }
  if (path === LAN) return { view: 'lan' };
  if (path === PROJECTS) return { view: 'projects' };
  if (path === SETTINGS) return { view: 'settings' };
  if (path === ATASCO || path.startsWith(`${ATASCO}/`)) {
    return withItem({ view: 'atasco' }, path.slice(ATASCO.length));
  }
  if (path.startsWith(BOARD)) {
    const rest = path.slice(BOARD.length);
    const cut = rest.indexOf('/');
    const board = decode(cut < 0 ? rest : rest.slice(0, cut));
    if (!board) return { view: 'toca' };
    return withItem({ view: 'board', board }, cut < 0 ? '' : rest.slice(cut));
  }
  if (path.startsWith(ITEM)) return withItem({ view: 'toca' }, path);
  if (path.startsWith('/')) return { view: 'toca' };
  const id = idFromHash(hash);
  return id ? { view: 'toca', item: id } : { view: 'toca' };
}

const ATASCO = '/atasco';
const BOARD = '/b/';
const ITEM = '/i/';

// The item an open view holds: `<view>/i/<id>`. Anything else after a view is not a route.
function withItem(route: ViewRoute, rest: string): Route {
  if (rest === '') return route;
  if (!rest.startsWith(ITEM)) return { view: 'toca' };
  const item = decode(rest.slice(ITEM.length));
  return item ? { ...route, item } : route;
}

// A board, with nothing open.
export function boardHash(board: string): string {
  return `#${BOARD}${encodeURIComponent(board)}`;
}

// The hash of a route; an open item only on the views that list items.
export function hashOf(route: Route): string {
  const item = route.item ? `${ITEM}${encodeURIComponent(route.item)}` : '';
  switch (route.view) {
    case 'toca':
      return item ? `#${item}` : ITEMS_HASH;
    case 'atasco':
      return `#${ATASCO}${item}`;
    case 'board':
      return `${boardHash(route.board)}${item}`;
    case 'triage':
      return TRIAGE_HASH;
    case 'projects':
      return PROJECTS_HASH;
    case 'settings':
      return SETTINGS_HASH;
    case 'lan':
      return LAN_HASH;
    case 'studio':
      return studioHash(route.page);
    case 'modules':
      return modulesHash(route.name);
    case 'brief':
      return briefHash(route.ids);
  }
}

// Any other Studio path is its home.
function studioPage([kind, name]: string[]): StudioPage {
  const board = kind === 'board' && name ? decode(name) : undefined;
  return board ? { kind: 'board', board } : { kind: 'boards' };
}

export function studioHash(page: StudioPage = { kind: 'boards' }): string {
  return page.kind === 'board'
    ? `#${STUDIO}/board/${encodeURIComponent(page.board)}`
    : `#${STUDIO}`;
}

export function modulesHash(name?: string): string {
  return name === undefined ? `#${MODULES}` : `#${MODULES}/${encodeURIComponent(name)}`;
}

// A brief for the items given, in that order.
export function briefHash(ids: readonly string[]): string {
  return `#${BRIEF}/${ids.map(encodeURIComponent).join(',')}`;
}
