import { createElement, Fragment, type FunctionComponent, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { FeedEvent } from '../../activity.ts';
import { type App, AppTestProvider } from '../../app/context.tsx';
import { agent, ago, item, moved, NOW, officialType, you } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { LaneBlock } from '../../lanes/LaneList.tsx';
import type { Item } from '../../types.ts';
import { tocaBlocks } from './blocks.tsx';
import { deliveryOf, evidenceWords, quietLine } from './phone.ts';
import { TocaView } from './TocaView.tsx';

afterEach(() => setLanguage('en'));

const bug = officialType('bug-triage');
const collectionOf = () => ({
  name: 'Errores',
  prefix: 'ERR',
  preset: 'bug-triage',
  types: [{ ...bug, name: 'item' }],
  view: { kind: 'list' as const, groupBy: 'state', columns: [] },
  icon: null,
});

let seq = 1000;
const added = (itemId: string, kind: string, minutes: number, by = 'kiln'): FeedEvent => ({
  id: ++seq,
  itemId,
  type: 'evidence_added',
  actor: agent(by),
  at: ago(minutes),
  data: { kind, filename: `${kind}-${seq}`, role: 'single' },
});

const app = (all: Item[], feed: FeedEvent[] = []) => ({
  all,
  now: NOW,
  feed,
  collectionOf,
  route: { view: 'toca' as const },
});
const markup = (n: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, n));
const phone = (open = false) => ({ phone: { encamino: open, onFold: () => undefined } });

describe("what an agent delivered, as Te toca's review row says it", () => {
  it('reads the note of the handoff that brought it here and counts the files of this round', () => {
    const it0 = item({ id: 'A', state: 'verify' });
    const feed = [
      moved('A', 'fixing', agent('kiln'), { from: 'accepted', minutes: 300 }),
      added('A', 'image', 280),
      moved('A', 'verify', agent('kiln'), { reason: 'Primera.', minutes: 250 }),
      moved('A', 'fixing', you, { from: 'verify', reason: 'Otra vez.', minutes: 200 }),
      added('A', 'image', 150),
      added('A', 'image', 140),
      added('A', 'file', 130),
      added('A', 'log', 120),
      added('A', 'diff', 110),
      moved('A', 'verify', agent('kiln'), { reason: 'Reintenta la subida.', minutes: 100 }),
    ];
    expect(deliveryOf(it0, feed)).toEqual({
      agent: 'kiln',
      note: 'Reintenta la subida.',
      images: 2,
      files: 3,
    });
  });

  it("prefers a board handoff's note to its reason", () => {
    const it0 = item({ id: 'A', state: 'todo__review' });
    const feed = [
      {
        ...moved('A', 'todo__review', agent('mender'), { from: 'todo', minutes: 5 }),
        data: { from: 'todo', to: 'todo__review', note: 'Cruceta y botón B.', reason: 'x' },
      },
    ];
    expect(deliveryOf(it0, feed)).toMatchObject({ agent: 'mender', note: 'Cruceta y botón B.' });
  });

  it('says nothing for a move an agent did not make itself', () => {
    const feed = [moved('A', 'verify', you, { reason: 'Mío.' })];
    expect(deliveryOf(item({ id: 'A' }), feed)).toBeNull();
  });

  it('counts images and other files in words', () => {
    setLanguage('es');
    expect(evidenceWords(2, 3)).toBe('2 imágenes, 3 archivos');
    expect(evidenceWords(1, 0)).toBe('1 imagen');
    expect(evidenceWords(0, 1)).toBe('1 archivo');
    expect(evidenceWords(0, 0)).toBe('');
    setLanguage('en');
    expect(evidenceWords(1, 2)).toBe('1 image, 2 files');
  });

  it('joins the empty sections in one line', () => {
    setLanguage('es');
    expect(quietLine(['atasco', 'preguntas'])).toBe('Sin atascos ni preguntas para ti.');
    expect(quietLine(['atasco', 'preguntas', 'propios'])).toBe(
      'Sin atascos, preguntas para ti ni pasos tuyos.',
    );
    expect(quietLine(['propios'])).toBe('Sin pasos tuyos.');
    expect(quietLine([])).toBe('');
    setLanguage('en');
    expect(quietLine(['atasco', 'revisiones', 'propios'])).toBe(
      'Nothing stuck, no reviews and no steps of yours.',
    );
  });
});

describe('Te toca on the phone', () => {
  const all = [
    item({ id: 'R1', updatedAt: ago(120) }),
    item({ id: 'W1', title: 'Pantalla de créditos', turn: 'agent', state: 'fixing' }),
    item({ id: 'W2', turn: 'agent', state: 'fixing' }),
    item({ id: 'W3', turn: 'agent', state: 'fixing' }),
    item({ id: 'C1', turn: 'none', state: 'fixed', updatedAt: ago(5) }),
  ];
  const feed = [
    moved('W1', 'fixing', agent('lumen'), { from: 'accepted', minutes: 50 }),
    added('R1', 'image', 130, 'kiln'),
    moved('R1', 'verify', agent('kiln'), { reason: 'Reintenta la subida.', minutes: 120 }),
  ];

  it('lists only what is yours on top: empty sections join one italic line, no Cerrados', () => {
    setLanguage('es');
    const blocks = tocaBlocks(app(all, feed), false, phone());
    const secs = blocks.filter((b) => b.kind === 'sec').map((b) => b.kind === 'sec' && b.title);
    expect(secs).toEqual(['Revisiones', 'En camino']);
    const quiet = blocks.find((b) => b.key === 'quiet');
    expect(quiet).toMatchObject({ kind: 'empty' });
    expect(markup(quiet?.kind === 'empty' ? quiet.content : null)).toContain(
      'Sin atascos, preguntas para ti ni pasos tuyos.',
    );
    // The line comes after your sections and before En camino.
    const keys = blocks.map((b) => b.key);
    expect(keys.indexOf('quiet')).toBeGreaterThan(keys.indexOf('R1'));
    expect(keys.indexOf('quiet')).toBeLessThan(keys.indexOf('sec:encamino'));
    expect(keys).not.toContain('C1');
  });

  it('folds En camino into one line until it is opened', () => {
    setLanguage('es');
    const folded = tocaBlocks(app(all, feed), false, phone(false));
    expect(folded.filter((b) => b.kind === 'row').map((b) => b.key)).toEqual(['R1']);
    const fold = folded.find((b) => b.key === 'fold:encamino');
    const html = markup(fold?.kind === 'other' ? fold.content : null);
    expect(html).toContain('Pantalla de créditos y 2 más');
    expect(html).toContain('aria-expanded="false"');
    const open = tocaBlocks(app(all, feed), false, phone(true));
    expect(open.filter((b) => b.kind === 'row').map((b) => b.key)).toEqual([
      'R1',
      'W1',
      'W2',
      'W3',
    ]);
    const unfold = open.find((b) => b.key === 'fold:encamino');
    expect(markup(unfold?.kind === 'other' ? unfold.content : null)).toContain(
      'aria-expanded="true"',
    );
  });

  it('says on each review what the agent delivered: its note and how much evidence', () => {
    setLanguage('es');
    const blocks = tocaBlocks(app(all, feed), false, phone());
    const row = blocks.find((b) => b.key === 'R1') as Extract<LaneBlock, { kind: 'row' }>;
    const html = markup(row.content);
    expect(html).toContain('class="p-said"');
    expect(html).toContain('<q>Reintenta la subida.</q>');
    expect(html).toContain('1 imagen');
  });

  it('keeps the desk as it was', () => {
    setLanguage('es');
    const blocks = tocaBlocks(app(all, feed), false);
    const secs = blocks.filter((b) => b.kind === 'sec').map((b) => b.kind === 'sec' && b.title);
    expect(secs).toContain('Cerrados');
    expect(blocks.find((b) => b.key === 'quiet')).toBeUndefined();
    const row = blocks.find((b) => b.key === 'R1') as Extract<LaneBlock, { kind: 'row' }>;
    expect(markup(row.content)).not.toContain('p-said');
  });
});

describe("Te toca's head on the phone", () => {
  const Provider = AppTestProvider as unknown as FunctionComponent<{ value: App }>;
  const fake = (phoneOn: boolean): App =>
    ({
      now: NOW,
      feed: [
        moved('R1', 'verify', agent('kiln'), { minutes: 30 }),
        moved('X', 'verify', you, { minutes: 20 }),
      ],
      agents: [],
      all: [item({ id: 'R1', updatedAt: ago(30) })],
      route: { view: 'toca' },
      project: { id: 'h', name: 'Hollowmere' },
      session: { canWrite: true },
      items: { status: 'ready', value: [] },
      collectionOf,
      phone: phoneOn,
      go: () => undefined,
      openItem: () => undefined,
      closeItem: () => undefined,
      openConnect: () => undefined,
    }) as unknown as App;
  const render = (a: App) =>
    renderToStaticMarkup(createElement(Provider, { value: a }, createElement(TocaView)));

  it('says what waits in the dek and the day under it, the way the agents column did', () => {
    setLanguage('es');
    const html = render(fake(true));
    expect(html).toContain('Una cosa espera por ti');
    expect(html).not.toContain('Los agentes entregaron');
    expect(html).toContain('class="p-recap"');
    expect(html).toContain('Hoy entregaron 1, aprobaste 0 y devolviste 0 con notas.');
  });

  it('says the day under the title on the desk too, now that the agents column is gone', () => {
    setLanguage('es');
    const html = render(fake(false));
    expect(html).not.toContain('Los agentes entregaron');
    expect(html).toContain('class="recap"');
    expect(html).toMatch(/Hoy entregaron <span class="n">.*1.*<\/span>, aprobaste/);
  });
});
