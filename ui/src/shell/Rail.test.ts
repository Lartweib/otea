import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspace } from '../app/workspace.ts';
import { ago, item } from '../derive/fixtures.ts';
import { setLanguage } from '../i18n/i18n.ts';
import type { Topic, TopicsView } from '../topics.ts';
import type { CollectionView } from '../types.ts';
import { Rail } from './Rail.tsx';
import { renderIn, testApp } from './test-app.ts';

// The side topics are read with a fetch the server render never makes; a test hands them in.
const side = vi.hoisted(() => ({ view: undefined as TopicsView | undefined }));
vi.mock('../views/topics/use-topics.ts', async (actual) => ({
  ...(await actual<typeof import('../views/topics/use-topics.ts')>()),
  useTopics: () => side.view,
}));

afterEach(() => {
  setLanguage('en');
  workspace.set({ folded: false });
  side.view = undefined;
});

const topic = (id: string, state: Topic['state']): Topic => ({
  id,
  title: id,
  state,
  turn: state === 'answered' ? 'human' : 'agent',
  createdAt: '2026-11-17T10:00:00.000Z',
  updatedAt: '2026-11-17T10:00:00.000Z',
  by: { kind: 'agent', name: 'quill' },
  turns: [],
  links: [],
});

// Three answered (yours), one still open with the agent, one closed.
const topics = (on = true, list = true): TopicsView => ({
  on,
  topics: list
    ? [
        topic('TEM-1', 'answered'),
        topic('TEM-2', 'open'),
        topic('TEM-3', 'answered'),
        topic('TEM-4', 'closed'),
        topic('TEM-5', 'answered'),
      ]
    : [],
});

// The markup from one row's data-k to the next row's (or the end of its nav).
const rowOf = (html: string, k: string) => {
  const at = html.indexOf(`data-k="${k}"`);
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('</div>', at);
  return html.slice(start, end + '</div>'.length);
};

const board = (name: string, icon: string | null = null) =>
  ({ name, icon, types: [] }) as unknown as CollectionView;

const all = [
  item({ id: 'E1', collection: 'Errores', turn: 'human' }),
  item({ id: 'E2', collection: 'Errores', turn: 'agent' }),
  item({
    id: 'E3',
    collection: 'Errores',
    turn: 'agent',
    expiredLease: { holder: 'Kiln', expiresAt: ago(10) },
  }),
  item({ id: 'C1', collection: 'Criaturas', turn: 'agent' }),
];

const rail = (o: Parameters<typeof testApp>[0] = {}) => {
  setLanguage('es');
  return renderIn(
    testApp({ all, collections: [board('Errores', 'bug'), board('Criaturas', 'paw')], ...o }),
    createElement(Rail),
  );
};

describe('the rail', () => {
  // The + names what it makes: beside the word vistas it read as a new view (P7-14).
  it('heads with the fold and a new item that says so, the views label under them', () => {
    const html = rail();
    expect(html).toMatch(/class="ibtn"[^>]*aria-expanded="true"[^>]*aria-label="Ocultar el panel"/);
    expect(html).toMatch(
      /<button type="button" class="rnew"[^>]*>.*?<span class="lbl">Nuevo ítem<\/span><\/button>/,
    );
    expect(html).toContain('<div class="rail-label first">vistas</div>');
    expect(html.indexOf('class="rnew"')).toBeLessThan(html.indexOf('vistas</div>'));
    expect(html.indexOf('vistas</div>')).toBeLessThan(html.indexOf('Te toca'));
  });

  it('counts Te toca in your blue and Atasco in warn, each with its folded badge', () => {
    const html = rail();
    expect(html).toMatch(
      /Te toca<\/span><span class="pair"><span class="n you"><span class="nv" data-v="2">/,
    );
    expect(html).toMatch(
      /Atasco<\/span><span class="pair"><span class="n warn"><span class="nv" data-v="1">/,
    );
    expect(html).toContain('<i class="badge has">2</i>');
    expect(html).toContain('<i class="badge warn has">1</i>');
  });

  it('lists each board with its icon, yours over open, and a + for a new item in it', () => {
    const html = rail();
    expect(html).toContain('<div class="rail-label">tableros</div>');
    expect(html).toMatch(
      /Errores<\/span><span class="pair"[^>]*><span class="n you"><span class="nv" data-v="1">1<\/span><\/span> \/ <span class="n"><span class="nv" data-v="3">3/,
    );
    expect(html).toContain('aria-label="Nuevo ítem en Errores"');
    expect(html).toContain('Nuevo tablero');
  });

  // The + takes the pair's place under the pointer, so the row itself says what the pair counts,
  // folded or not.
  it('says what a board’s pair counts when you rest on its row', () => {
    expect(rail()).toMatch(
      /data-k="board:Errores" data-tip="Errores · Te toca: 1 · Abiertos: 3" data-tip-more=""/,
    );
    setLanguage('en');
    const en = renderIn(
      testApp({ all, collections: [board('Errores', 'bug'), board('Criaturas', 'paw')] }),
      createElement(Rail),
    );
    expect(en).toContain('data-tip="Errores · Your turn: 1 · Open: 3" data-tip-more=""');
    // Te toca and Atasco count one thing each: their rows name it, and say nothing more.
    expect(rail()).toMatch(/data-k="toca" data-tip="Te toca">/);
  });

  it('marks the row in view and slides one pill under it', () => {
    const html = rail({ route: { view: 'board', board: 'Criaturas' } });
    expect(html).toMatch(/class="nrow on"[^>]*aria-current="page"[^>]*data-k="board:Criaturas"/);
    expect(html.match(/class="rsel"/g)).toHaveLength(1);
  });

  // Temas wait for you to read or close them, as Te toca does: they end the views, set apart from
  // Te toca and Atasco by a small gap (lists of items above, conversations here), with no heading.
  it('ends the views with Temas, after Te toca and Atasco, a gap above it and no heading', () => {
    side.view = topics();
    const html = rail();
    const order = [
      'vistas</div>',
      'data-k="toca"',
      'data-k="atasco"',
      'data-k="topics"',
      'tableros</div>',
      'proyecto</div>',
    ];
    let at = -1;
    for (const w of order) {
      const i = html.indexOf(w);
      expect(i, w).toBeGreaterThan(at);
      at = i;
    }
    // In the views' own list: no heading and no new list between Atasco and Temas.
    const between = html.slice(html.indexOf('data-k="atasco"'), html.indexOf('data-k="topics"'));
    expect(between).not.toContain('rail-label');
    expect(between).not.toContain('</nav>');
    expect(rowOf(html, 'topics')).toMatch(/^<div class="nrow apart"/);
    expect(rowOf(html, 'atasco')).toMatch(/^<div class="nrow"/);
    expect(rowOf(html, 'topics')).toContain('<span class="lb">Temas</span>');
    expect(rowOf(html, 'topics')).toContain('class="type-icon');
    // Studio, Configuración and Rendimiento keep the project to themselves.
    const project = html.slice(html.indexOf('proyecto</div>'));
    expect(project).not.toContain('Temas');
    expect(project.indexOf('data-k="studio"')).toBeLessThan(project.indexOf('data-k="settings"'));
    expect(project.indexOf('data-k="settings"')).toBeLessThan(
      project.indexOf('data-k="performance"'),
    );
  });

  it('counts the answered topics, yours, as Te toca counts its own, with a folded badge', () => {
    side.view = topics();
    const html = rail();
    expect(rowOf(html, 'topics')).toMatch(
      /Temas<\/span><span class="pair"><span class="n you"><span class="nv" data-v="3">/,
    );
    expect(rowOf(html, 'topics')).toContain('<i class="badge has">3</i>');
    // None answered: a quiet 0, and no badge on the strip.
    side.view = { on: true, topics: [topic('TEM-2', 'open')] };
    const none = rowOf(rail(), 'topics');
    expect(none).toContain('data-v="0"');
    expect(none).toContain('<i class="badge">0</i>');
  });

  it('lists Temas while topics are on or some were kept, as the phone does', () => {
    side.view = topics(true, false);
    expect(rail()).toContain('data-k="topics"');
    side.view = topics(false, true);
    expect(rail()).toContain('data-k="topics"');
    side.view = topics(false, false);
    expect(rail()).not.toContain('data-k="topics"');
    side.view = undefined;
    expect(rail()).not.toContain('data-k="topics"');
  });

  it('slides the pill under Temas while you read them', () => {
    side.view = topics();
    const html = rail({ route: { view: 'topics' } });
    expect(html.match(/class="nrow[^"]*\bon\b/g)).toHaveLength(1);
    expect(rowOf(html, 'topics')).toMatch(/^<div class="nrow on apart"[^>]*aria-current="page"/);
  });

  it('keeps the project’s Studio and, for whoever may configure it, its settings', () => {
    const html = rail();
    expect(html).toContain('<div class="rail-label">proyecto</div>');
    expect(html).toContain('Studio');
    expect(html).toContain('Configuración');
    const reader = rail({
      session: { canWrite: false, canConfigure: false, canManageDevices: false },
    });
    expect(reader).not.toContain('Configuración');
    expect(reader).not.toContain('Nuevo tablero');
    expect(reader).not.toContain('class="rnew"');
    expect(reader).toContain('<div class="rail-label first">vistas</div>');
  });

  it('says it opens again once folded', () => {
    workspace.set({ folded: true });
    expect(rail()).toMatch(/aria-expanded="false"[^>]*aria-label="Mostrar el panel"/);
  });
});
