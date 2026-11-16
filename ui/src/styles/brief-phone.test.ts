import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Encargo page on a phone: each row puts its id over its title, so the title keeps the width
// the move buttons leave it; the way back and the ids answer a finger.

const read = (file: string) =>
  readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const brief = read('./brief.css');
const phone = readFileSync(new URL('./phone.css', import.meta.url), 'utf8')
  .split(String.fromCharCode(13))
  .join('');

const narrow = (() => {
  const at = brief.indexOf('@media (max-width: 720px) {');
  return at < 0 ? '' : brief.slice(at);
})();

describe('an Encargo row on a phone', () => {
  it('stacks the id over the title, beside the move buttons', () => {
    expect(narrow).toMatch(/\.brief-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/);
    expect(narrow).toMatch(/\.brief-ttl \{[^}]*white-space: normal;/);
  });

  it('gives the way back and the ids a 44 px reach', () => {
    const finger = phone.slice(phone.indexOf('a finger: every control'));
    expect(finger).toContain('.brief-head .back');
    expect(finger).toContain('.brief-row .t-id');
  });
});
