import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../catalog.ts';
import type { Remote } from '../remote.ts';
import type { PresetView } from '../types.ts';
import { CatalogOverview, ModuleIndex, ModulePanel } from './ModuleCatalog.tsx';

const presets: Remote<PresetView[]> = { status: 'ready', value: [] };

const rating: CatalogEntry = {
  name: 'rating',
  origin: 'unknown',
  uses: [{ board: 'Notas', field: { name: 'fscore', module: 'rating', label: 'Puntuación' } }],
};

const panel = (entry: CatalogEntry) =>
  renderToStaticMarkup(createElement(ModulePanel, { entry, presets }));

describe('module catalog view', () => {
  it('marks a local module unofficial, at your own risk', () => {
    const html = panel({ name: 'diagram', origin: 'local', uses: [] });

    expect(html).toContain('<span class="enum">local</span>');
    expect(html).toContain('unofficial · at your own risk');
  });

  it('shows an unknown module as plain text, with the board fields that name it', () => {
    const html = panel(rating);

    expect(html).toContain('unknown module · renders as plain text');
    expect(html).toContain('Puntuación');
    expect(html).toContain('on Notas');
    expect(html).not.toContain('Preview');
    expect(html).not.toMatch(/preset/i);
  });

  it('lists unknown modules apart in the index', () => {
    const html = renderToStaticMarkup(
      createElement(ModuleIndex, {
        entries: [{ name: 'text', origin: 'official', uses: [] }, rating],
        selected: 'rating',
      }),
    );

    expect(html).toContain('Named by boards, not in this UI');
    expect(html).toContain('href="#/modules/rating" aria-current="page"');
  });

  it('previews the severity module with its bars, critical in the warning hue', () => {
    const html = panel({ name: 'severity', origin: 'official', uses: [] });

    expect(html).toContain('Sample: critical, in the warning hue');
    expect(html).toContain('class="svb s4"');
    expect(html).not.toContain('preset.yaml');
  });

  it('opens on the boards and the module of each of their fields, never a preset', () => {
    const view: PresetView['view'] = { kind: 'list', groupBy: 'turn', columns: ['id', 'title'] };
    const board: PresetView = {
      name: 'biliahj5',
      version: 1,
      origin: 'project',
      fields: [{ name: 'f645foj8', module: 'severity', label: 'Severidad' }],
      types: [],
      view,
      collections: ['Errores'],
    };
    const official: PresetView = {
      ...board,
      name: 'bug-triage',
      origin: 'official',
      collections: [],
    };
    const html = renderToStaticMarkup(
      createElement(CatalogOverview, { presets: { status: 'ready', value: [board, official] } }),
    );

    expect(html).toContain('<h2 class="margin-label" id="mod-boards">Boards</h2>');
    expect(html).toContain('Errores');
    expect(html).toContain('href="#/modules/severity"');
    expect(html).toContain('Severidad');
    expect(html).not.toContain('biliahj5');
    expect(html).not.toContain('bug-triage');
    expect(html).not.toMatch(/preset/i);
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
