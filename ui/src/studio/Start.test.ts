import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { officialType } from '../derive/fixtures.ts';
import { setLanguage } from '../i18n/i18n.ts';
import type { PresetView } from '../types.ts';
import type { PresetSummary, ProjectBlueprint } from './api.ts';
import { Start } from './Start.tsx';

setLanguage('es');

const SUMMARIES: PresetSummary[] = [
  { name: 'bug-triage', origin: 'official', version: 3, collections: ['Errores'], problems: [] },
  { name: 'review', origin: 'project', version: 1, collections: [], problems: [] },
];
const VIEWS = [
  { name: 'bug-triage', types: [officialType('bug-triage')] },
] as unknown as PresetView[];

function render(blueprint: ProjectBlueprint | null = null, canCustomize = true) {
  return renderToStaticMarkup(
    createElement(Start, {
      project: 'Hollowmere',
      presets: { status: 'ready', value: SUMMARIES },
      views: VIEWS,
      blueprint,
      items: [
        { id: 'ERRORES-1', collection: 'Errores' },
        { id: 'ERRORES-2', collection: 'Errores' },
      ] as never,
      canCustomize,
    }),
  );
}

describe('Studio’s start', () => {
  it('opens like every view: a kicker with the project, the display and a dek', () => {
    const html = render();
    expect(html).toContain('<p class="kicker"><b>Hollowmere</b> · cómo trabaja</p>');
    expect(html).toContain('<h1 class="display">Studio</h1>');
    expect(html).toMatch(/<p class="dek">Cómo trabaja este proyecto: las plantillas/);
  });

  it('heads its sections as the lists do: a serif name, the count, a gloss and a hairline', () => {
    const html = render();
    expect(html).toContain('<h2>Plantillas de tablero</h2>');
    expect(html).toMatch(/<h2>Plantillas de tablero<\/h2><span class="n"><span class="nv"[^>]*>2</);
    expect(html).toContain('<i class="rl"></i>');
  });

  it('draws each template with its way of working on the lanes laid flat', () => {
    const html = render();
    expect(html.match(/<li class="st-trow"/g)?.length).toBe(2);
    expect(html).toContain('<svg class="st-route"');
    expect(html).toContain('Lo usa Errores · 2 ítems');
    expect(html).toContain('Ningún tablero la usa todavía');
    expect(html).toContain('href="#/customize/preset/bug-triage"');
  });

  it('offers to pick a blueprint while the project has none', () => {
    const html = render(null);
    expect(html).toContain('Todavía no hay plano.');
    expect(html).toContain('href="#/studio/blueprints"');
  });

  it('keeps Personalizar for whoever can configure on a desk', () => {
    expect(render(null, false)).not.toContain('#/customize/');
  });
});
