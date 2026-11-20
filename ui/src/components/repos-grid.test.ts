import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Repos } from './ProjectSettings.tsx';

// Configuración, the repos table: the header and every row share one set of columns, so a column
// starts at the same x in the header and in each row whatever its cells hold. An empty cell reads
// "—" rather than leaving a hole.

const css = readFileSync(new URL('../styles/projects.css', import.meta.url), 'utf8').replace(
  /\r/g,
  '',
);

const rule = (selector: string, from = 0, indent = ''): string => {
  const at = css.indexOf(`\n${indent}${selector} {`, from);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};
// The table reflows by its section's width (a phone, or Configuración beside a sheet).
const narrow = css.indexOf('@container pjsec (max-width: 620px)');

describe('the repos table grid', () => {
  it('is one grid for the whole table', () => {
    expect(rule('.pj-repos')).toMatch(/display: grid;/);
    expect(rule('.pj-repos')).toMatch(/grid-template-columns: /);
  });

  it('is shared by the header and every row', () => {
    expect(rule('.pj-repo')).toMatch(/grid-column: 1 \/ -1;/);
    expect(rule('.pj-repo')).toMatch(/grid-template-columns: subgrid;/);
  });

  it('narrows the table, not each row, when it is narrow', () => {
    expect(narrow).toBeGreaterThan(0);
    expect(rule('.pj-repos', narrow, '  ')).toMatch(/grid-template-columns: /);
    expect(rule('.pj-repo', narrow, '  ')).not.toMatch(/grid-template-columns: (?!subgrid)/);
  });

  it('gives the folder and the gate the full width when narrow, beside no other cell', () => {
    const wide = rule('.pj-repo > .pj-repo-wide', narrow, '  ');
    expect(wide).toMatch(/grid-column: 1 \/ -1;/);
    expect(rule('.pj-repo > .pj-repo-items', narrow, '  ')).toMatch(/grid-area: 1 \/ 2;/);
  });
});

describe('an empty repos cell', () => {
  it('reads — when the repo is the folder itself', () => {
    const html = renderToStaticMarkup(
      createElement(Repos, {
        repos: [{ name: 'otea', folder: '.', gate: 'soft', items: 3, remote: false }],
      }),
    );
    expect(html).toContain('<span class="t-cap pj-repo-wide">—</span>');
  });

  it('shows the folder when the repo sits inside it', () => {
    const html = renderToStaticMarkup(
      createElement(Repos, {
        repos: [{ name: 'api', folder: 'api', gate: 'hard', items: 0, remote: false }],
      }),
    );
    expect(html).toContain('<span class="t-cap pj-repo-wide">api/</span>');
  });
});

describe('the gate of a repo', () => {
  // The command that makes it hard is one the person can paste: hook install needs --git.
  it('names the whole command for a repo without the hook', () => {
    const html = renderToStaticMarkup(
      createElement(Repos, {
        repos: [{ name: 'bot', folder: '.', gate: 'soft', items: 1, remote: false }],
      }),
    );
    expect(html).toContain('<code class="pj-code">otea hook install --git</code>');
  });

  // A hook an older Otea wrote lets a push through when Otea cannot run: the command updates it.
  it('says the hook is outdated, with the command that updates it', () => {
    const html = renderToStaticMarkup(
      createElement(Repos, {
        repos: [
          {
            name: 'bot',
            folder: '.',
            gate: 'hard',
            items: 1,
            remote: false,
            hookOutdated: true,
          },
        ],
      }),
    );
    expect(html).toContain('data-hook="outdated"');
    expect(html).toContain('<code class="pj-code">otea hook install --git</code>');
    expect(html).not.toContain('data-gate="hard"');
  });
});
