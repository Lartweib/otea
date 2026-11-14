import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNotice, sseEvents, sseMessages } from './live.ts';
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

describe('sseMessages', () => {
  it('keeps each message’s data', () => {
    expect(sseMessages('event: notice\ndata: {"title":"Te toca"}\n\nevent: rea')).toEqual({
      messages: [{ event: 'notice', data: '{"title":"Te toca"}' }],
      rest: 'event: rea',
    });
  });
});

describe('parseNotice', () => {
  it('reads a notice the server sent the desktop app', () => {
    expect(
      parseNotice(
        '{"title":"Te toca","body":"T-1 · Ship","tag":"otea-item-T-1","url":"/#/i/T-1","item":"T-1"}',
      ),
    ).toEqual({ title: 'Te toca', body: 'T-1 · Ship', tag: 'otea-item-T-1', url: '/#/i/T-1' });
  });

  it('opens only places in the app, and skips what does not read', () => {
    expect(parseNotice('{"title":"x","body":"y","url":"https://evil.example"}')?.url).toBe('/#/');
    expect(parseNotice('{"title":1}')).toBeUndefined();
    expect(parseNotice('nope')).toBeUndefined();
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
