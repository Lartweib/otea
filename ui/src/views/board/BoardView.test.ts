import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type App, AppTestProvider } from '../../app/context.tsx';
import { agent, inMinutes, item, moved, NOW, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { CollectionView, Item, ViewSpec } from '../../types.ts';
import { BoardView } from './BoardView.tsx';

const bug = officialType('bug-triage');
const errores = (kind: ViewSpec['kind']): CollectionView => ({
  name: 'Errores',
  prefix: 'ERR',
  preset: 'bug-triage',
  icon: 'bug',
  types: [bug],
  view: { kind, groupBy: 'turn', columns: ['id', 'title', 'state', 'severity', 'who', 'age'] },
});

const seed: Item[] = [
  item({ id: 'ERR-1', title: 'La niebla parpadea', state: 'verify', fields: { severity: 'high' } }),
  item({
    id: 'ERR-2',
    title: 'El barro salpica',
    state: 'fixing',
    turn: 'agent',
    lease: { holder: 'mender', expiresAt: inMinutes(50) },
  }),
  item({
    id: 'ERR-3',
    title: 'Polen en el menú',
    state: 'rejected',
    turn: 'none',
    closes: 'discarded',
  }),
];

const render = (kind: ViewSpec['kind'], all: Item[] = seed, phone = false) => {
  const col = errores(kind);
  const value = {
    all,
    now: NOW,
    feed: [moved('ERR-1', 'verify', agent('mender'))],
    collectionOf: (name: string) => (name === 'Errores' ? col : undefined),
    route: { view: 'board', board: 'Errores' },
    project: { id: 'p', name: 'Hollowmere', icon: null },
    phone,
  } as unknown as App;
  const props = { value } as Parameters<typeof AppTestProvider>[0];
  return renderToStaticMarkup(
    createElement(AppTestProvider, props, createElement(BoardView, { board: 'Errores' })),
  );
};

beforeEach(() => setLanguage('es'));
afterEach(() => setLanguage('en'));

describe('a board', () => {
  it('heads with its kicker, its name, the preset dek and the steps strip', () => {
    const html = render('list');
    expect(html).toContain('<b>Tablero</b>');
    expect(html).toContain('Hollowmere');
    expect(html).toContain('<h1 class="display" data-leaf="">Errores</h1>');
    expect(html).toContain('Los errores, del primer aviso al arreglo.');
    expect(html).toMatch(/class="steps".*reportado.*aceptado.*en arreglo.*a verificar.*Hecho/);
    expect(html).toMatch(/<span class="you">a verificar <span class="n sn">/);
  });

  it('offers Pasos, Lista and Tabla, the count and Nuevo ítem; no Tabla on the phone', () => {
    const html = render('list');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html).toContain('Pasos');
    expect(html).toContain('3 ítems');
    expect(html).toContain('Nuevo ítem');
    expect(render('list', seed, true).match(/role="tab"/g)).toHaveLength(2);
  });

  it('lists Lista grouped by step, each row on its lane with its id, step and who', () => {
    const html = render('list');
    expect(html).toContain('data-list="board"');
    expect(html).toMatch(
      /<h2[^>]*>en arreglo<\/h2>.*ERR-2.*<h2[^>]*>a verificar<\/h2>.*ERR-1.*<h2[^>]*>Hecho<\/h2>.*ERR-3/,
    );
    expect(html).toMatch(/data-k="ERR-1" data-h="you" data-look="yours"/);
    expect(html).toContain('<span class="stp you">a verificar</span>');
    expect(html).toContain('class="svb s3"');
  });

  it('lays Pasos out in columns with cards, the closed work in Hecho', () => {
    const html = render('board');
    expect(html).toContain('class="cols"');
    expect(html).toMatch(/<h3>en arreglo<\/h3>.*data-k="ERR-2"/);
    expect(html).toMatch(/<h3>Hecho<\/h3>.*data-k="ERR-3".*<i>descartado<\/i>/);
    expect(html).toContain('data-s="ERR-1:edge"');
  });

  it('draws Tabla with its sticky head: the lanes, tick-all, sortable heads with carets', () => {
    const html = render('grid');
    expect(html).toContain('class="tabla');
    expect(html).toContain('class="thead"');
    expect(html).toMatch(/class="lab"[^>]*>ítem<\/button>/);
    expect(html).toMatch(/class="lab"[^>]*>paso<\/button><button[^>]*class="car"/);
    expect(html).toContain('data-list="table"');
    expect(html).toMatch(/class="row trow[^"]*" data-k="ERR-1"/);
  });

  it('nests children under their parent, its progress coloured by whose turn each is', () => {
    const parent = item({
      id: 'ERR-9',
      title: 'El puente de cuerda',
      state: 'accepted',
      turn: 'agent',
      children: { total: 2, open: 2, done: 0, discarded: 0 },
    });
    const kid = (id: string, o: Partial<Item>) =>
      item({ id, relations: [{ kind: 'parent', id: 'ERR-9' }], ...o });
    const html = render('list', [
      parent,
      kid('ERR-10', { state: 'verify' }),
      kid('ERR-11', { state: 'fixing', turn: 'agent' }),
    ]);
    expect(html).toContain('<span class="prog"><i class="you"></i><i class="ag"></i></span>');
    expect(html).toContain('2 de 2 abiertos');
    expect(html).toMatch(
      /data-k="ERR-9".*class="row child" data-k="ERR-10".*class="row child" data-k="ERR-11"/,
    );
    expect(html).toContain('aria-expanded="true"');
  });

  it('shows the empty board with Nuevo ítem en Errores and Conectar un agente', () => {
    const html = render('list', []);
    expect(html).toContain('Todavía no hay ítems en Errores.');
    expect(html).toContain('Nuevo ítem en Errores');
    expect(html).toContain('Conectar un agente');
  });
});
