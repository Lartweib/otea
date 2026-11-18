// Every project has its page on this computer's one Otea server, at /p/<project id>/, and its API
// under the same path. The page reads which project it is on from its own address.

const PROJECT_PATH = /^\/p\/([^/]+)\//;

// The project a page path is on, or none (the pairing screen, the home page).
export function projectIdOf(pathname: string): string | undefined {
  const match = PROJECT_PATH.exec(pathname);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

const pathname = () => (typeof window === 'undefined' ? '/' : window.location.pathname);

// The project this page is on.
export const currentProjectId = (): string | undefined => projectIdOf(pathname());

// A project's page, at one of its places (a hash route, `#/i/TASKS-1`).
export function projectPage(id: string, hash = '#/'): string {
  return `/p/${encodeURIComponent(id)}/${hash}`;
}

// An API path (`/api/items`) of the project this page is on; the computer's own API (`/api/pair`)
// outside a project.
export function apiUrl(path: string, from: string = pathname()): string {
  if (!path.startsWith('/api')) return path;
  const id = projectIdOf(from);
  return id === undefined ? path : `/p/${encodeURIComponent(id)}${path}`;
}
