// Routes live in the hash: `#<item-id>` selects an item, `#/modules[/<name>]` opens the catalog and
// `#/triage` the swipe triage. Item ids never start with a slash, so they never collide.
export type Route =
  | { view: 'items'; id?: string }
  | { view: 'modules'; name?: string }
  | { view: 'triage' };

const MODULES = '/modules';
const TRIAGE = '/triage';

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
  if (path.startsWith('/')) return { view: 'items' };
  const id = idFromHash(hash);
  return id ? { view: 'items', id } : { view: 'items' };
}

export function modulesHash(name?: string): string {
  return name === undefined ? `#${MODULES}` : `#${MODULES}/${encodeURIComponent(name)}`;
}
