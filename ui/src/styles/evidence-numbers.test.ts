import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The line numbers of a diff, a log or a file read at 4.5:1: the muted ink, which the token tests
// hold to that on a well, never faded further.

const css = readFileSync(new URL('./evidence.css', import.meta.url), 'utf8').replace(/\r/g, '');
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  const open = css.indexOf('{', at);
  return at < 0 ? '' : css.slice(open + 1, css.indexOf('}', open));
};

describe('a line number', () => {
  it('is the muted ink at full strength', () => {
    const body = rule('.ev-no');
    expect(body).toMatch(/color: var\(--ink-3\);/);
    expect(body).not.toMatch(/opacity/);
  });
});
