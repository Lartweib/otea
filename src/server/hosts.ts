export const DEFAULT_PORT = 4400;

// The API: the computer's at /api, a project's at /p/<id>/api.
export const isApiPath = (path: string): boolean => /^(?:\/p\/[^/]+)?\/api(?:\/|$)/.test(path);

export function isAllowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}
