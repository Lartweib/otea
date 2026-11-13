import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Triaje's stack: the card under the top one shows only its offset edge, however long it is. The
// top card's height reaches it as --h (Triage.tsx sets it on the stack).

const css = readFileSync(new URL('./triage.css', import.meta.url), 'utf8').replace(/\r/g, '');

// The body of the rule whose whole selector is `selector`, at the top level.
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};

describe('the card under the top one', () => {
  it('is as tall as the top card, so a longer one does not stick out below it', () => {
    expect(rule('.tcard.under')).toMatch(/\n\s*height: var\(--h, auto\);/);
  });

  it('cuts what it says past that height, keeping the stamp above it', () => {
    expect(rule('.tcard.under')).toMatch(
      /clip-path: inset\(-\d+px -\d+px 0 -\d+px round 0 0 12px 12px\);/,
    );
  });
});
