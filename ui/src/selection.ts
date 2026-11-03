// Routes live in the hash: `#<item-id>` selects an item, `#/modules[/<name>]` opens the catalog,
// `#/triage` the swipe triage, `#/brief/<id>,<id>` a brief for those items, `#/studio[/...]` the
// Studio (see StudioPage) and `#/lan` the phone pairing. Item ids never start with a slash, so they
// never collide.
export type Route =
  | { view: 'items'; id?: string }
  | { view: 'modules'; name?: string }
  | { view: 'triage' }
  | { view: 'brief'; ids: string[] }
  | { view: 'studio'; page: StudioPage }
  | { view: 'lan' };

// Studio's pages: the start (the project's blueprint, or the blueprints to build it from), a
// preset, the project's blueprint edited or drawn as its diagram.
export type StudioPage =
  | { kind: 'start' }
  | { kind: 'preset'; name: string }
  | { kind: 'blueprint'; diagram: boolean }
  | { kind: 'blueprints' };

const MODULES = '/modules';
const TRIAGE = '/triage';
const BRIEF = '/brief';
const STUDIO = '/studio';
const LAN = '/lan';

// LAN access: the pairing code for a phone and the paired devices.
export const LAN_HASH = `#${LAN}`;

// Swipe triage: what waits for you, one card at a time.
export const TRIAGE_HASH = `#${TRIAGE}`;

// The item list with nothing selected.
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
  if (path.startsWith('/')) return { view: 'items' };
  const id = idFromHash(hash);
  return id ? { view: 'items', id } : { view: 'items' };
}

function studioPage([kind, name]: string[]): StudioPage {
  if (kind === 'preset' && name) {
    const decoded = decode(name);
    if (decoded) return { kind: 'preset', name: decoded };
  }
  if (kind === 'blueprint') return { kind: 'blueprint', diagram: name === 'diagram' };
  if (kind === 'blueprints') return { kind: 'blueprints' };
  return { kind: 'start' };
}

export function studioHash(page: StudioPage = { kind: 'start' }): string {
  switch (page.kind) {
    case 'preset':
      return `#${STUDIO}/preset/${encodeURIComponent(page.name)}`;
    case 'blueprint':
      return `#${STUDIO}/blueprint${page.diagram ? '/diagram' : ''}`;
    case 'blueprints':
      return `#${STUDIO}/blueprints`;
    default:
      return `#${STUDIO}`;
  }
}

export function modulesHash(name?: string): string {
  return name === undefined ? `#${MODULES}` : `#${MODULES}/${encodeURIComponent(name)}`;
}

// A brief for the items given, in that order.
export function briefHash(ids: readonly string[]): string {
  return `#${BRIEF}/${ids.map(encodeURIComponent).join(',')}`;
}
