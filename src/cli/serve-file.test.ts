import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readServeFile, removeServeFile, SERVE_FILE, writeServeFile } from './serve-file.ts';

describe('serve file', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'otea-serve-file-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('records the port and pid of the running server', () => {
    writeServeFile(dir, { port: 4401, pid: 42 });

    expect(readServeFile(dir)).toEqual({ port: 4401, pid: 42 });
  });

  it('reads nothing without a file', () => {
    expect(readServeFile(dir)).toBeUndefined();
  });

  it.each(['not json', '{"port":"4400","pid":1}', '{"pid":1}', '[]'])(
    'ignores a malformed file %s',
    (content) => {
      writeFileSync(join(dir, SERVE_FILE), content);

      expect(readServeFile(dir)).toBeUndefined();
    },
  );

  it('removes the file only for the server that wrote it', () => {
    writeServeFile(dir, { port: 4401, pid: 42 });

    removeServeFile(dir, 7);
    expect(existsSync(join(dir, SERVE_FILE))).toBe(true);

    removeServeFile(dir, 42);
    expect(existsSync(join(dir, SERVE_FILE))).toBe(false);
  });

  it('removes nothing when there is no file', () => {
    expect(() => removeServeFile(dir, 42)).not.toThrow();
  });
});
