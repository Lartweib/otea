import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureUiToken, readUiToken, sameToken, UI_TOKEN_FILE } from './token.ts';

describe('ui token', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'otea-token-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('creates a random base64url token of 32 bytes in the ui-token file', () => {
    const token = ensureUiToken(dir);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(readFileSync(join(dir, UI_TOKEN_FILE), 'utf8').trim()).toBe(token);
  });

  it('reuses the persisted token', () => {
    const first = ensureUiToken(dir);

    expect(ensureUiToken(dir)).toBe(first);
    expect(readUiToken(dir)).toBe(first);
  });

  it('creates different tokens for different projects', () => {
    const other = mkdtempSync(join(tmpdir(), 'otea-token-'));

    expect(ensureUiToken(other)).not.toBe(ensureUiToken(dir));
    rmSync(other, { recursive: true, force: true });
  });

  it('replaces a malformed token file', () => {
    writeFileSync(join(dir, UI_TOKEN_FILE), 'short\n');

    const token = ensureUiToken(dir);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(readUiToken(dir)).toBe(token);
  });

  it('reads nothing when there is no token yet', () => {
    expect(readUiToken(dir)).toBeUndefined();
  });

  it.skipIf(process.platform === 'win32')('restricts the file to its owner', () => {
    ensureUiToken(dir);

    expect(statSync(join(dir, UI_TOKEN_FILE)).mode & 0o777).toBe(0o600);
  });

  it.each([
    ['abc', 'abc', true],
    ['abc', 'abd', false],
    ['abc', 'abcd', false],
    ['', '', false],
  ])('compares %j and %j as %s', (a, b, expected) => {
    expect(sameToken(a, b)).toBe(expected);
  });
});
