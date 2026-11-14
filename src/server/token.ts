import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { restrictToOwner } from '../app/owner-only.ts';

export const UI_TOKEN_FILE = 'ui-token';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function readUiToken(dir: string): string | undefined {
  const path = join(dir, UI_TOKEN_FILE);
  if (!existsSync(path)) return undefined;
  const token = readFileSync(path, 'utf8').trim();
  return TOKEN_PATTERN.test(token) ? token : undefined;
}

// The token is kept to its owner: mode 0600, and on Windows, which ignores the mode, an ACL for the
// current user alone (`restrict`); `warn` says when that could not be done.
export function ensureUiToken(
  dir: string,
  {
    warn,
    restrict = (path: string) => restrictToOwner(path, warn ? { warn } : {}),
  }: { warn?: (message: string) => void; restrict?: (path: string) => void } = {},
): string {
  const existing = readUiToken(dir);
  if (existing) return existing;
  const token = randomBytes(32).toString('base64url');
  const path = join(dir, UI_TOKEN_FILE);
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best effort: some file systems ignore permissions
  }
  restrict(path);
  return token;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function sameToken(given: string, expected: string): boolean {
  if (expected === '') return false;
  return timingSafeEqual(digest(given), digest(expected));
}
