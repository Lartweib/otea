import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { type App, AppTestProvider } from '../../app/context.tsx';
import { ago, inMinutes, NOW, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { CollectionView, ItemEvent, ItemView } from '../../types.ts';
import { ItemSheet } from './ItemSheet.tsx';
import { HandedList } from './PhoneItem.tsx';

afterEach(() => setLanguage('en'));

const bug = officialType('bug-triage');
const errores = {
  name: 'Errores',
  prefix: 'ERR',
  preset: 'bug-triage',
  types: [bug],
} as unknown as CollectionView;
let seq = 0;
const ev = (
  type: string,
  actor: ItemEvent['actor'],
  data: Record<string, unknown>,
  m: number,
): ItemEvent => ({ id: ++seq, type, actor, at: ago(m), data });
const mender = { kind: 'agent', name: 'Mender' } as const;
const you = { kind: 'human', name: 'fede' } as const;

const shot = (id: number, filename: string, m: number) => ({
  id,
  itemId: 'ERR-214',
  role: 'single' as const,
  module: null,
  kind: filename.endsWith('.png') ? ('image' as const) : ('file' as const),
  filename,
  contentType: filename.endsWith('.png') ? 'image/png' : 'text/plain',
  size: 10,
  sha256: '',
  caption: null,
  createdAt: ago(m),
  actor: mender,
  channel: 'cli',
});

const review: ItemView = {
  id: 'ERR-214',
  collection: 'Errores',
  type: bug.name,
  title: 'Los lobos no cruzan el puente de cuerda',
  fields: { severity: 'high', category: 'gameplay' },
  presetVersion: 3,
  state: 'verify',
  turn: 'human',
  createdAt: ago(900),
  updatedAt: ago(14),
  createdBy: { kind: 'agent', name: 'Scout' },
  lease: null,
  events: [
    ev('created', { kind: 'agent', name: 'Scout' }, { state: 'reported' }, 900),
    ev('transitioned', you, { from: 'reported', to: 'accepted' }, 800),
    ev('transitioned', mender, { from: 'accepted', to: 'fixing' }, 700),
    ev('transitioned', mender, { from: 'fixing', to: 'verify', reason: 'Lo probé.' }, 600),
    ev('transitioned', you, { from: 'verify', to: 'fixing', reason: 'El último se queda.' }, 500),
    ev('transitioned', mender, { from: 'fixing', to: 'verify', reason: 'Ya cruzan.' }, 14),
  ],
  transitions: [
    { to: 'fixed', by: 'human-ui', reasonRequired: false, turn: 'none', closes: 'done' },
    { to: 'fixing', by: 'human', reasonRequired: true, turn: 'agent' },
    { to: 'wont_fix', by: 'human-ui', reasonRequired: true, turn: 'none', closes: 'discarded' },
  ],
  relayable: [],
  missing: [],
  evidence: [shot(1, 'antes.png', 650), shot(2, 'puente.png', 100), shot(3, 'wolf.ts', 90)],
  relations: [],
};

const app = (phone: boolean) =>
  ({
    connection: 'live',
    version: 1,
    now: NOW,
    session: { canWrite: true, canConfigure: true, canManageDevices: true },
    all: [],
    collections: [errores],
    collectionOf: (n: string) => (n === 'Errores' ? errores : undefined),
    agents: [],
    feed: [],
    route: { view: 'toca', item: 'ERR-214' },
    phone,
  }) as unknown as App;

const render = (shown: ItemView = review, phone = true) =>
  renderToStaticMarkup(
    <AppTestProvider value={app(phone)}>
      <ItemSheet
        item={shown}
        full={false}
        nav={{ prev: false, next: true }}
        onNav={() => undefined}
        onFull={() => undefined}
        onClose={() => undefined}
      />
    </AppTestProvider>,
  );

describe('reviewing an item on the phone', () => {
  it('goes back to where it came from and says the item and its step on one line', () => {
    setLanguage('es');
    const html = render();
    expect(html).toContain('class="p-ihead"');
    expect(html).toMatch(/class="p-back"[^>]*>.*Te toca<\/button>/);
    expect(html).not.toContain('class="sheet-bar');
    expect(html).not.toContain('d-hist');
  });

  it('shows the rounds of the step as one segment, newest first, and Comparar', () => {
    setLanguage('es');
    const html = render();
    const seg = html.slice(html.indexOf('class="p-rseg"'));
    const labels = [
      ...seg.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/g),
    ]
      .slice(0, 3)
      .map((m) => [m[1], m[2]?.replace(/<[^>]+>/g, '|')]);
    expect(labels).toEqual([
      ['true', 'Ronda 2|tu veredicto|'],
      ['false', 'Ronda 1|devuelta|'],
      ['false', 'Comparar|1 → 2|'],
    ]);
  });

  it('puts what was delivered first: its note, its evidence, what you asked the round before', () => {
    setLanguage('es');
    const html = render();
    const at = (s: string) => html.indexOf(s);
    expect(html).toContain('Lo que entregó');
    expect(html).toContain('Ya cruzan.');
    expect(html).not.toContain('Lo probé.');
    expect(html).toContain('1 imagen, 1 archivo');
    expect(html).toContain('puente.png');
    expect(html).toContain('wolf.ts');
    expect(html).not.toContain('antes.png');
    expect(html).toContain('Lo que pediste en la ronda 1');
    expect(html).toContain('El último se queda.');
    expect(at('Ya cruzan.')).toBeLessThan(at('puente.png'));
    expect(at('puente.png')).toBeLessThan(at('El último se queda.'));
    // Who, type, board and the rest fold under Detalles, after the delivery.
    expect(at('Detalles')).toBeGreaterThan(at('El último se queda.'));
    expect(html).toMatch(/class="p-more"[^>]*aria-expanded="false"/);
  });

  it('docks Devolver and Aprobar at the bottom, without Descartar', () => {
    setLanguage('es');
    const html = render();
    const dock = html.slice(html.indexOf('class="p-dock"'));
    expect(dock).toContain('>Devolver…</button>');
    expect(dock).toContain('>Aprobar</button>');
    expect(dock).toContain('Aprobar <b>→ ');
    expect(html).not.toContain('Descartar');
    expect(html).not.toContain('cerrar como');
  });

  it('says beside Aprobar how many files are still unopened, without holding the move', () => {
    setLanguage('es');
    const dock = render().slice(render().indexOf('class="p-dock"'));
    expect(dock).toContain('Sin abrir: 2 de 2 archivos');
    expect(dock).toMatch(/<button[^>]*class="btn primary"(?![^>]*disabled)/);
  });

  it('reads an item on an agent turn without a dock or a move', () => {
    setLanguage('es');
    const html = render({
      ...review,
      state: 'fixing',
      turn: 'agent',
      lease: { holder: 'Mender', expiresAt: inMinutes(30) } as ItemView['lease'],
      transitions: [
        { to: 'wont_fix', by: 'human-ui', reasonRequired: true, turn: 'none', closes: 'discarded' },
      ],
    });
    expect(html).not.toContain('p-dock');
    expect(html).not.toContain('cerrar como');
    expect(html).toContain('class="p-ihead"');
    expect(html).toContain('class="receipt"');
  });

  it('offers only Retomar and Reasignar on a stuck item', () => {
    setLanguage('es');
    const html = render({
      ...review,
      state: 'fixing',
      turn: 'agent',
      lease: null,
      expiredLease: { holder: 'Mender', expiresAt: ago(40) } as ItemView['lease'] & object,
      transitions: [
        { to: 'wont_fix', by: 'human-ui', reasonRequired: true, turn: 'none', closes: 'discarded' },
      ],
    });
    expect(html).toContain('>Retomar<');
    expect(html).toContain('>Reasignar…<');
    expect(html).not.toContain('cerrar como');
    expect(html).toContain('class="p-ihead"');
    expect(html).not.toContain('p-dock');
  });

  it('folds what was asked under one line of its prose, never its raw Markdown (DR2-22)', () => {
    setLanguage('es');
    const html = render({
      ...review,
      fields: {
        ...review.fields,
        description: '## Problema\nLos **lobos** se quedan.\n\n| A | B |\n|---|---|',
      },
    });
    const fold = html.slice(html.indexOf('Lo pedido'));
    const summary = /class="s">([^<]*)</.exec(fold)?.[1];
    expect(summary).toBe('Los lobos se quedan.');
  });

  it('draws a long field a step handed off as Markdown, a short one as it is (IDEA2-2)', () => {
    const html = renderToStaticMarkup(
      <HandedList
        fields={[
          {
            ref: 'fbrief',
            name: 'Brief',
            value: '## Problema\n\n| A | B |\n|---|---|\n| 1 | 2 |',
            long: true,
          },
          { ref: 'fsha', name: 'Commit', value: 'abc123', long: false },
        ]}
      />,
    );
    expect(html).toContain('<h2>Problema</h2>');
    expect(html).toContain('<table');
    expect(html).not.toContain('## Problema');
    expect(html).not.toContain('|---|');
    expect(html).toContain('<dd>abc123</dd>');
  });

  // Pros («+ ») and cons («- ») drew as the same «•» bullets on the phone, where the desk shows a
  // green + and a red − (P7-R2-5).
  it('draws the options a step handed off with their gains and costs apart', () => {
    const html = renderToStaticMarkup(
      <HandedList
        fields={[
          {
            ref: 'options',
            name: 'Opciones',
            value:
              '### A · SQLite local (recomendada)\nTodo queda en el dispositivo.\n+ funciona sin red\n- sin sincronizar\n\n### B · Backend\n+ sincroniza\n- cuesta dinero',
            long: true,
            options: true,
          },
        ]}
      />,
    );
    const gains = html.slice(html.indexOf('class="op-gains"'));
    expect(gains).toMatch(/^class="op-gains"[^>]*><li>funciona sin red<\/li><\/ul>/);
    expect(html).toMatch(/class="op-costs"[^>]*><li>sin sincronizar<\/li><\/ul>/);
    expect(html).toContain('<b>SQLite local</b>');
    expect(html).toContain('<p class="op-summary">Todo queda en el dispositivo.</p>');
    expect(html).not.toContain('<li>+ ');
  });

  // A Decisión at Diseñar offered only Devolver and «Aprobar → Planificar» on the phone; the desk's
  // «Mover a Hecho» was missing, so it could not be closed from the phone (P7-R2-3).
  it('offers the other moves in the dock, as the desk does; discarding stays on the desk', () => {
    setLanguage('es');
    const html = render({
      ...review,
      transitions: [
        ...review.transitions,
        { to: 'reported', by: 'human-ui', reasonRequired: false, turn: 'agent' },
      ],
    });
    const dock = html.slice(html.indexOf('class="p-dock"'));
    expect(dock).toMatch(
      /class="p-ways"><button[^>]*data-move="reported"[^>]*>Mover a [^<]+<\/button>/,
    );
    expect(dock).not.toContain('data-move="wont_fix"');
  });

  it('leaves the desk sheet as it was', () => {
    const html = render(review, false);
    expect(html).toContain('class="sheet-bar');
    expect(html).not.toContain('p-dock');
  });
});
