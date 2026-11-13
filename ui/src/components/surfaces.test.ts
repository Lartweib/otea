import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedEvent } from '../activity.ts';
import { type App, AppTestProvider } from '../app/context.tsx';
import { workspace } from '../app/workspace.ts';
import { agent, ago, inMinutes, item, moved, NOW, officialType } from '../derive/fixtures.ts';
import { setLanguage } from '../i18n/i18n.ts';
import type { CollectionView, ProjectOverview } from '../types.ts';
import { ActivityDrawer } from './ActivityDrawer.tsx';
import { ConnectDialog } from './ConnectDialog.tsx';
import { LandsAs, previewBlock } from './LandsAs.tsx';
import { LanPanel } from './LanPanel.tsx';
import { NewItemForm } from './NewItemForm.tsx';
import { elsewhereBlocks, hereBlocks, ProjectsInbox } from './ProjectsInbox.tsx';
import { Triage } from './Triage.tsx';

afterEach(() => {
  setLanguage('en');
  workspace.set({ connect: false, activity: false, intake: null });
});

const bug = officialType('bug-triage');
const errores: CollectionView = {
  name: 'Errores',
  preset: 'bug-triage',
  prefix: 'ERR',
  types: [bug],
} as unknown as CollectionView;

const items = [
  item({ id: 'ERR-1', title: 'Los lobos no cruzan', state: 'verify', updatedAt: ago(90) }),
  item({ id: 'ERR-2', title: 'La sombra parpadea', state: 'verify', updatedAt: ago(20) }),
  item({
    id: 'ERR-3',
    title: 'El guardado se corrompe',
    state: 'fixing',
    turn: 'agent',
    lease: { holder: 'mender', expiresAt: inMinutes(102) },
  }),
];

const feed: FeedEvent[] = [
  {
    id: 900,
    itemId: 'ERR-3',
    type: 'claimed',
    actor: agent('mender'),
    at: ago(18),
    data: { holder: 'mender', expiresAt: inMinutes(102) },
  },
  moved('ERR-1', 'verify', agent('mender'), { reason: 'Ya cruzan.', minutes: 12 }),
];

function fakeApp(o: Partial<App> = {}): App {
  const noop = () => undefined;
  return {
    connection: 'live',
    version: 1,
    now: NOW,
    session: { canWrite: true, canConfigure: true, canManageDevices: true },
    sync: { offline: false, syncedAt: null },
    canCapture: true,
    project: { id: 'hollowmere', name: 'Hollowmere' } as NonNullable<App['project']>,
    items: { status: 'ready', value: items },
    all: items,
    collections: [errores],
    collectionsReady: true,
    collectionOf: (name) => (name === 'Errores' ? errores : undefined),
    presets: [],
    presetsRemote: { status: 'ready', value: [] },
    studioWrites: 0,
    agents: [],
    feed,
    route: { view: 'toca' },
    phone: false,
    go: noop,
    openItem: noop,
    closeItem: noop,
    move: async () => undefined,
    update: async () => undefined,
    note: async () => undefined,
    answer: async () => undefined,
    restart: async () => undefined,
    reassign: async () => undefined,
    link: async () => undefined,
    unlink: async () => undefined,
    newItem: noop,
    openActivity: noop,
    closeActivity: noop,
    openConnect: noop,
    closeConnect: noop,
    openAgent: noop,
    closeAgent: noop,
    studioChanged: noop,
    ...o,
  };
}

// The provider takes its children as createElement passes them.
const Provider = AppTestProvider as unknown as FunctionComponent<{ value: App }>;

const render = (node: ReactNode, app = fakeApp()) =>
  renderToStaticMarkup(createElement(Provider, { value: app }, node));

describe('Triaje', () => {
  it('heads the pass with its position and counts, the review waiting longest on top', () => {
    setLanguage('es');
    const html = render(createElement(Triage, {}));
    expect(html).toContain('Triaje');
    expect(html).toContain('de 2');
    expect(html).toContain('0 decididos');
    // the next card waits under the top one, which comes last
    expect(html.indexOf('tcard under')).toBeLessThan(html.indexOf('Los lobos no cruzan'));
    expect(html).toMatch(/<article class="tcard under"[^>]*data-tk="ERR-2"/);
    expect(html).toMatch(/<article class="tcard"[^>]*data-tk="ERR-1"/);
  });

  it('says who hands the card over and what it said, and offers the four ways out', () => {
    setLanguage('es');
    const html = render(createElement(Triage, {}));
    expect(html).toContain('<b>mender</b> te lo entrega.');
    expect(html).toContain('Ya cruzan.');
    for (const word of ['Aprobar', 'Devolver…', 'Después', 'abrir el ítem'])
      expect(html).toContain(word);
  });

  it('is all caught up when nothing waits for review', () => {
    setLanguage('es');
    const html = render(createElement(Triage, {}), fakeApp({ all: items.slice(2) }));
    expect(html).toContain('Todo al día.');
    expect(html).toContain('Volver a Te toca');
  });
});

describe('Actividad', () => {
  it('lists each lease with its arc and time left, then the feed in the agent’s words', () => {
    setLanguage('es');
    vi.useFakeTimers({ now: NOW });
    const html = render(createElement(ActivityDrawer, { open: true, onClose: () => undefined }));
    vi.useRealTimers();
    expect(html).toContain('class="drawer"');
    expect(html).toMatch(/Reservas activas(<!-- -->)? <small>1<\/small>/);
    expect(html).toContain('1 h 42 min');
    expect(html).toContain('restante');
    expect(html).toContain('stroke-dasharray');
    expect(html.replace(/<!-- -->/g, '')).toMatch(
      /mender reservó <button[^>]*class="id"[^>]*>ERR-3<\/button> por 2 h/,
    );
    for (const chip of ['todo', 'reservas', 'traspasos', 'evidencia', 'todos']) {
      expect(html).toContain(`>${chip}</button>`);
    }
  });

  it('renders nothing while closed', () => {
    expect(render(createElement(ActivityDrawer, { open: false, onClose: () => undefined }))).toBe(
      '',
    );
  });
});

describe('Nuevo ítem', () => {
  it('draws the bar, the title, the lede and the board as chips', () => {
    setLanguage('es');
    const html = render(
      createElement(NewItemForm, {
        board: 'Errores',
        onCancel: () => undefined,
        onCreated: () => undefined,
      }),
    );
    expect(html).toContain('Nuevo ítem');
    expect(html).toContain('En Errores.');
    expect(html).toMatch(/class="chipb on"[^>]*>Errores</);
    expect(html).toContain('Qué hay que hacer, en una línea');
    expect(html).toContain('llega como');
    expect(html).toContain('data-list="preview"');
    expect(html).toContain('Lo verás en Errores, en su carril.');
  });

  it('the preview row sits on the lane it starts on, inert, untitled until you type', () => {
    setLanguage('es');
    const block = previewBlock({
      id: 'ERR-4',
      title: '',
      state: 'Reportado',
      landing: { turn: 'human', kind: 'you' },
    });
    expect(block).toMatchObject({ kind: 'row', lane: 'you', look: 'yours', inert: true });
    const html = render(
      createElement(LandsAs, {
        id: 'ERR-4',
        title: '',
        state: 'Reportado',
        landing: { turn: 'agent', kind: 'queued' },
      }),
    );
    expect(html).toContain('Sin título todavía');
    expect(html).toContain('data-h="ag"');
  });
});

describe('Te espera', () => {
  const salinas: ProjectOverview = {
    id: 'salinas',
    name: 'Salinas',
    storage: 'common',
    current: false,
    paths: [{ path: 'D:/juegos/salinas' } as ProjectOverview['paths'][number]],
    waiting: [{ ...item({ id: 'SAL-12', title: 'La marea no sube' }), state: 'review' }],
    withAgents: 0,
    open: 1,
  };

  it('lists this project open now, with what waits for you', () => {
    setLanguage('es');
    const blocks = hereBlocks(fakeApp(), 'Hollowmere');
    expect(blocks[0]).toMatchObject({
      kind: 'sec',
      title: 'Hollowmere',
      count: 2,
      gloss: 'abierto ahora',
    });
    expect(blocks.filter((b) => b.kind === 'row').map((b) => b.key)).toEqual(['ERR-1', 'ERR-2']);
  });

  it('lists another project by its path, its rows saying where they open', () => {
    setLanguage('es');
    const blocks = elsewhereBlocks(salinas);
    expect(blocks[0]).toMatchObject({ kind: 'sec', title: 'Salinas', gloss: 'D:/juegos/salinas' });
    expect(blocks[1]).toMatchObject({ kind: 'row', inert: true, lane: 'you' });
    const served = elsewhereBlocks({ ...salinas, served: 'http://127.0.0.1:4500' });
    expect(served[1]).toMatchObject({ inert: false });
  });

  it('heads the page Te espera on the lanes', () => {
    setLanguage('es');
    const html = render(createElement(ProjectsInbox, {}), fakeApp({ projects: [salinas] }));
    expect(html).toContain('Todos los proyectos');
    expect(html).toContain('Te espera');
    expect(html).toContain('data-list="projects"');
    expect(html).toContain('sin servidor');
  });
});

describe('dialogs', () => {
  it('Conectar un agente says what to add, with the command and Hecho', () => {
    setLanguage('es');
    workspace.set({ connect: true });
    const html = render(createElement(ConnectDialog));
    expect(html).toContain('Conectar un agente');
    expect(html).toContain('otea mcp --as &lt;nombre&gt;');
    expect(html).toContain('>Hecho</button>');
  });

  it('Emparejar un teléfono asks this computer’s browser to sign in when it cannot manage devices', () => {
    setLanguage('es');
    const html = render(createElement(LanPanel, { canManage: false }));
    expect(html).toContain('Emparejar un teléfono');
    expect(html).toContain('otea open');
    expect(html).toContain('>Hecho</button>');
  });
});
