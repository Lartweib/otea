import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOT_FILES } from '../scripts/stage-files.mjs';

// What the installer carries from the checkout's root beside the CLI (scripts/stage-cli.mjs): the
// license, and the notices of the fonts the UI bundles (#458), which their license asks to ship.
describe('the files staged from the root', () => {
  it('carry the license and the third-party notices', () => {
    expect(ROOT_FILES).toEqual(
      expect.arrayContaining(['package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md']),
    );
  });

  it('are all in the checkout', () => {
    for (const file of ROOT_FILES) {
      expect(existsSync(new URL(`../../${file}`, import.meta.url)), file).toBe(true);
    }
  });
});
