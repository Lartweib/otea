import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sseEvents } from './live.ts';
import { readServeFile, readUiToken, signInUrl } from './server.ts';

describe('sseEvents', () => {
  it('reads the event names of complete messages and keeps the unfinished rest', () => {
    expect(sseEvents('event: ready\ndata: \n\nevent: change\ndata: \n\nevent: cha')).toEqual({
      events: ['ready', 'change'],
      rest: 'event: cha',
    });
  });

  it('accepts CRLF line ends and skips messages without an event', () => {
    expect(sseEvents('data: x\r\n\r\nevent: change\r\n\r\n')).toEqual({
      events: ['change'],
      rest: '',
    });
  });
});

describe('the serve files', () => {
  it('reads the port and the token otea serve leaves in the data folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'otea-desktop-'));
    try {
      expect(readServeFile(dir)).toBeUndefined();
      expect(readUiToken(dir)).toBeUndefined();
      writeFileSync(join(dir, 'serve.json'), '{"port":4486,"pid":12}\n');
      writeFileSync(join(dir, 'ui-token'), `${'a'.repeat(43)}\n`);
      expect(readServeFile(dir)).toEqual({ port: 4486, pid: 12 });
      expect(readUiToken(dir)).toBe('a'.repeat(43));
      writeFileSync(join(dir, 'ui-token'), 'short\n');
      expect(readUiToken(dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds the sign-in link the browser gets from otea open', () => {
    expect(signInUrl('http://127.0.0.1:4486', 'a+b')).toBe(
      'http://127.0.0.1:4486/auth?token=a%2Bb',
    );
  });
});
