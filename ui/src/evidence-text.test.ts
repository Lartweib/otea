import { describe, expect, it } from 'vitest';
import { parseDiff } from './evidence.ts';
import { isErrorLine, logMatches, sideBySide } from './evidence-text.ts';

describe('sideBySide', () => {
  it('pairs a run of removed lines with the added lines that replace them', () => {
    const [file] = parseDiff('@@ -1,3 +1,3 @@\n a\n-b\n-c\n+B\n d\n');
    const rows = sideBySide(file?.hunks[0]?.lines ?? []);
    expect(rows.map((r) => [r.left?.text ?? null, r.right?.text ?? null])).toEqual([
      ['a', 'a'],
      ['b', 'B'],
      ['c', null],
      ['d', 'd'],
    ]);
  });

  it('keeps an addition with nothing removed on the right only', () => {
    const [file] = parseDiff('@@ -1 +1,2 @@\n a\n+new\n');
    const rows = sideBySide(file?.hunks[0]?.lines ?? []);
    expect(rows[1]).toEqual({ right: { kind: 'add', new: 2, text: 'new' } });
  });

  it('lays a "no newline" note across both sides', () => {
    const [file] = parseDiff('@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n');
    const rows = sideBySide(file?.hunks[0]?.lines ?? []);
    expect(rows.some((r) => r.note)).toBe(true);
  });
});

describe('isErrorLine', () => {
  it('finds the lines that report a failure', () => {
    for (const line of [
      'Error: boom',
      'FAIL src/a.test.ts',
      '  ✗ saves the tip',
      'TypeError: x is undefined',
      'npm ERR! code 1',
      '[error] could not connect',
      'Traceback (most recent call last):',
      'panic: runtime error',
      '2026-11-16T02:00:00Z ERROR paso 0: sincronizando',
      'level=error msg="no route"',
      '12:00:01 FATAL disk full',
    ])
      expect(isErrorLine(line), line).toBe(true);
  });

  it('leaves passing and ordinary lines alone', () => {
    for (const line of [
      '✓ saves the tip',
      'Tests: 0 failed, 12 passed',
      'no errors found',
      'info: ok',
    ])
      expect(isErrorLine(line), line).toBe(false);
  });
});

describe('logMatches', () => {
  const lines = ['start', 'Error: one', 'middle', 'error two', 'end'].map((text, i) => ({
    number: i + 1,
    text,
  }));

  it('finds the lines holding the words, ignoring case', () => {
    expect(logMatches(lines, 'ERROR')).toEqual([2, 4]);
  });

  it('finds nothing for an empty search', () => {
    expect(logMatches(lines, '  ')).toEqual([]);
  });
});
