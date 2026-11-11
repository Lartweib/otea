import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../catalog.ts';
import type { Remote } from '../remote.ts';
import type { PresetView } from '../types.ts';
import { ModuleIndex, ModulePanel } from './ModuleCatalog.tsx';

const presets: Remote<PresetView[]> = { status: 'ready', value: [] };

const rating: CatalogEntry = {
  name: 'rating',
  origin: 'unknown',
  uses: [
    {
      preset: 'research',
      version: 2,
      origin: 'project',
      field: { name: 'score', module: 'rating' },
      collections: ['notes'],
    },
  ],
};

const panel = (entry: CatalogEntry) =>
  renderToStaticMarkup(createElement(ModulePanel, { entry, presets }));

describe('module catalog view', () => {
  it('marks a local module unofficial, at your own risk', () => {
    const html = panel({ name: 'diagram', origin: 'local', uses: [] });

    expect(html).toContain('<span class="enum">local</span>');
    expect(html).toContain('unofficial · at your own risk');
  });

  it('shows an unknown module as plain text, with the preset fields that name it', () => {
    const html = panel(rating);

    expect(html).toContain('unknown module · renders as plain text');
    expect(html).toContain('research.score');
    expect(html).toContain('in notes');
    expect(html).not.toContain('Preview');
  });

  it('lists unknown modules apart in the index', () => {
    const html = renderToStaticMarkup(
      createElement(ModuleIndex, {
        entries: [{ name: 'text', origin: 'official', uses: [] }, rating],
        selected: 'rating',
      }),
    );

    expect(html).toContain('Named by presets, not in this UI');
    expect(html).toContain('href="#/modules/rating" aria-current="page"');
  });

  it('previews the severity module with its bars, critical in the warning hue', () => {
    const html = panel({ name: 'severity', origin: 'official', uses: [] });

    expect(html).toContain('Sample: critical, in the warning hue');
    expect(html).toContain('class="svb s4"');
    expect(html).toContain('module: severity');
  });
});

describe('the catalog in the Editorial grammar', () => {
  it('opens a module like the detail opens an item: a kicker, its name, a dek', () => {
    const html = panel({ name: 'severity', origin: 'official', uses: [] });
    expect(html).toContain('<article class="mod-sheet" aria-labelledby="mod-title">');
    expect(html).toMatch(/<p class="kicker"><b>field module<\/b> · /);
    expect(html).toContain('<h1 class="mod-name" id="mod-title">severity</h1>');
    expect(html).toMatch(/<p class="dek">/);
  });

  it('names each section in the margin, over a hairline', () => {
    const html = panel({ name: 'severity', origin: 'official', uses: [] });
    expect(html).toMatch(
      /<section class="mod-sec" aria-labelledby="mod-preview"><h2 class="margin-label" id="mod-preview">Preview/,
    );
    expect(html).toContain('<h2 class="margin-label" id="mod-uses">Used by</h2>');
  });

  it('draws a sample row on its lane, its title in the row’s serif', () => {
    const html = panel({ name: 'severity', origin: 'official', uses: [] });
    expect(html).toContain('<span class="sample-row"><svg class="cn"');
  });
});
