import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Te toca, Atasco and Te espera share the panel. On a wide screen it keeps its reading width and
// sits in the middle of the main pane (frame.css, shared with a board: column.test.ts); beside an
// open item it keeps today's place and width (the list compacts on the left of the detail).

const css = readFileSync(new URL('./toca.css', import.meta.url), 'utf8').replace(/\r/g, '');

// The body of the rule whose whole selector is `selector`, at the top level.
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};

describe('the panel on a wide screen', () => {
  it('keeps its reading width', () => {
    expect(rule('.panel')).toMatch(/max-width: 1120px;/);
  });

  it('is not centred beside an open item', () => {
    expect(rule('.panel')).not.toMatch(/margin/);
    expect(rule('.view.narrow .panel')).not.toMatch(/margin/);
  });
});
