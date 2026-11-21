import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { joinPrompt, startPrompt } from '../../../src/core/agent-prompts.ts';
import type { FeedEvent } from '../activity.ts';
import { type App, AppTestProvider } from '../app/context.tsx';
import { workspace } from '../app/workspace.ts';
import { agent, ago, inMinutes, item, moved, NOW, officialType } from '../derive/fixtures.ts';
import { setLanguage } from '../i18n/i18n.ts';
import type { CollectionView, ProjectOverview } from '../types.ts';
import { ActivityDrawer } from './ActivityDrawer.tsx';
import { ConnectDialog, ConnectView } from './ConnectDialog.tsx';
import { LandsAs, previewBlock } from './LandsAs.tsx';
import { BeforeScan, LanPanel } from './LanPanel.tsx';
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
    retry: noop,
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
    editNote: async () => undefined,
    withdrawNote: async () => undefined,
    answer: async () => undefined,
    restart: async () => undefined,
    reassign: async () => undefined,
    resume: async () => undefined,
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

  it('reads the handoff note as Markdown, never its raw marks (P7-11)', () => {
    setLanguage('es');
    const reason = '## Resumen\n- **causa**: el_parseo';
    const said = [moved('ERR-1', 'verify', agent('mender'), { reason })];
    const html = render(createElement(Triage, {}), fakeApp({ feed: said }));
    expect(html).toContain('<h2>Resumen</h2>');
    expect(html).toContain('<strong>causa</strong>: el_parseo');
    expect(html).not.toContain('## Resumen');
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

  it('says a question in words, never by its event type', () => {
    setLanguage('es');
    const asked: FeedEvent = {
      id: 901,
      itemId: 'ERR-3',
      type: 'question_asked',
      actor: agent('mender'),
      at: ago(5),
      data: { question: 1, text: '¿Cuál?' },
    };
    const html = render(
      createElement(ActivityDrawer, { open: true, onClose: () => undefined }),
      fakeApp({ feed: [...feed, asked] }),
    );
    expect(html).not.toContain('question_asked');
    expect(html.replace(/<!-- -->/g, '')).toMatch(/te preguntó en <button[^>]*>ERR-3<\/button>/);
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
    // Crear waits for the title, and says so beside it, where the form says where it lands once
    // it can be created (P6-R2-8).
    expect(html).toContain('aria-describedby="intake-why"');
    expect(html).toContain(
      '<span class="hint" id="intake-why" aria-live="polite">Falta Título para crear.</span>',
    );
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
    waiting: [
      {
        ...item({ id: 'SAL-12', title: 'La marea no sube' }),
        state: 'sk3j9x__review',
        stateName: 'Refinar (en revisión)',
      },
    ],
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

  it('says who takes your own step next, never that you opened it', () => {
    setLanguage('es');
    const own = item({
      id: 'ERR-4',
      title: 'Una idea mía',
      state: bug.initial,
      turn: 'human',
      createdBy: { kind: 'human', name: 'me' },
    });
    const blocks = hereBlocks(fakeApp({ all: [own] }), 'Hollowmere');
    const row = blocks.find((b) => b.kind === 'row' && b.key === 'ERR-4');
    expect(row).toBeDefined();
    const html = renderToStaticMarkup(
      createElement('div', null, (row as { content: ReactNode }).content),
    );
    expect(html).toContain('Tu paso');
    expect(html).not.toContain('lo abriste');
    expect(html).toMatch(/después (lo toma un agente|lo hace|se cierra)/);
  });

  it('lists another project by its path, its rows saying where they open', () => {
    setLanguage('es');
    const blocks = elsewhereBlocks(salinas);
    expect(blocks[0]).toMatchObject({ kind: 'sec', title: 'Salinas', gloss: 'D:/juegos/salinas' });
    // Every project is on this same server: its rows open its page.
    expect(blocks[1]).toMatchObject({ kind: 'row', inert: false, lane: 'you' });
    const gone = elsewhereBlocks({ ...salinas, unavailable: 'The data is missing' });
    expect(gone.find((block) => block.kind === 'row')).toMatchObject({ inert: true });
    // The step in words, in the language on screen, never its id.
    const html = renderToStaticMarkup(
      createElement('div', null, (blocks[1] as { content: ReactNode }).content),
    );
    expect(html).toContain('Refinar · en revisión');
    // The same id lives in several projects: the project's name goes right after it.
    expect(html).toContain(
      '<span class="id">SAL-12</span><span class="mpt"><span class="sep">·</span><span class="pid">Salinas</span></span>',
    );
    expect(html).not.toContain('sk3j9x');
  });

  // Answered topics wait for you too, though never work: a few per project, the rest counted.
  it('lists the topics an agent answered in each project, a few at most', () => {
    setLanguage('es');
    const answered = (n: number) => ({
      id: `TEM-${n}`,
      title: `Tema ${n}`,
      summary: 'MIT.',
      agent: 'quill',
      updatedAt: '2026-11-17T10:00:00.000Z',
    });
    const chatty = { ...salinas, topics: [1, 2, 3, 4, 5].map(answered) };
    const blocks = elsewhereBlocks(chatty);
    expect(blocks[0]).toMatchObject({ kind: 'sec', count: 6 });
    expect(blocks.filter((b) => b.kind === 'row').map((b) => b.key)).toEqual([
      'salinas:SAL-12',
      'topic:salinas:TEM-1',
      'topic:salinas:TEM-2',
      'topic:salinas:TEM-3',
    ]);
    const more = blocks.find((b) => b.kind === 'empty');
    const html = renderToStaticMarkup(
      createElement('div', null, (more as { content: ReactNode }).content),
    );
    expect(html).toContain('Y 2 temas respondidos más');
    expect(html).toContain('/p/salinas/#/topics');

    const here = hereBlocks(fakeApp({ all: [] }), 'Hollowmere', [answered(7)]);
    expect(here[0]).toMatchObject({ kind: 'sec', count: 1 });
    expect(here.some((b) => b.kind === 'empty')).toBe(false);
    expect(here.find((b) => b.kind === 'row')?.key).toBe('topic:here:TEM-7');
  });

  it('calls idle only a project with nothing open, and counts the agents’ work apart', () => {
    setLanguage('es');
    const quiet = (id: string, withAgents: number): ProjectOverview => ({
      ...salinas,
      id,
      name: id,
      waiting: [],
      withAgents,
      open: withAgents,
    });
    const html = render(
      createElement(ProjectsInbox, {}),
      fakeApp({ projects: [quiet('nogit', 0), quiet('p3', 1), quiet('p4', 1)] }),
    );
    expect(html).toContain('nogit no tiene nada abierto.');
    expect(html).toContain('No se listan aquí: 2 ítems con agentes, en p3 y p4.');
    expect(html).not.toContain('p3 y p4 no tienen nada abierto');
  });

  it('heads the page Te espera on the lanes', () => {
    setLanguage('es');
    const html = render(createElement(ProjectsInbox, {}), fakeApp({ projects: [salinas] }));
    expect(html).toContain('Todos los proyectos');
    expect(html).toContain('Te espera');
    expect(html).toContain('data-list="projects"');
    expect(html).toContain('una fila de otro proyecto lo abre aquí');
    expect(html).not.toContain('pestaña');
  });
});

// A command's words, each kept whole on its line (CommandWords), read back as the command.
const unwrapWords = (html: string) => html.replace(/<span class="nw">([^<]*)<\/span>/g, '$1');

describe('dialogs', () => {
  it('Conectar un agente gives a project with no board the whole first contact to paste', () => {
    setLanguage('es');
    workspace.set({ connect: true });
    expect(render(createElement(ConnectDialog))).toContain('>Hecho</button>');
    const html = unwrapWords(
      render(createElement(ConnectView, { view: { kind: 'start', prompt: startPrompt('es') } })),
    );
    expect(html).toContain('Conectar un agente');
    expect(html).toContain('te pregunta cómo trabajas y te propone los tableros');
    expect(html).toContain('otea connect --as &lt;nombre&gt; --model &lt;modelo&gt;');
    expect(html).toContain('otea board draft --new');
    expect(html).not.toContain('otea mcp --as');
    // One instruction for every harness: Otea writes no harness config.
    expect(html).toContain('qué servidor MCP agregar a su propia configuración');
    expect(html).not.toContain('.mcp.json');
    expect(html).toContain('otea wait --turn agent --unclaimed');
    expect(html).toContain('Copiar la instrucción');
    expect(html).toContain('en cuanto llama a Otea');
    expect(html).not.toContain('primera reserva');
  });

  it('Conectar un agente gives a project with boards the join prompt, from the project now', () => {
    setLanguage('es');
    const prompt = joinPrompt('es', {
      boards: [{ name: 'Cambios', agentSteps: ['Aclarar', 'Hacerlo'], waiting: 2 }],
      working: ['claude'],
    });
    const html = render(createElement(ConnectView, { view: { kind: 'join', prompt } }));
    expect(html).toContain('Para sumar un agente más');
    expect(html).toContain('(claude)');
    expect(html).toContain('- Cambios: Aclarar, Hacerlo (2 esperan a un agente ahora)');
    expect(html).not.toContain('otea board draft');
    // One more agent connects too: what connect writes names nobody.
    expect(html).toContain('El agente ejecuta <code class="inl">otea connect</code>');
    expect(html).not.toContain('.mcp.json');
  });

  it('Conectar un agente speaks to the first agent of a project with boards, with no one to join', () => {
    setLanguage('es');
    const prompt = joinPrompt('es', { boards: [], working: [], first: true });
    const html = render(
      createElement(ConnectView, { view: { kind: 'join', prompt, first: true } }),
    );
    expect(html).not.toContain('Para sumar un agente más');
    expect(html).toContain('Pega esto en el chat de tu agente. Se conecta con un nombre propio');
    expect(html).toContain('El agente ejecuta <code class="inl">otea connect</code>');
  });

  it('Connect an agent reads in English too', () => {
    setLanguage('en');
    const html = unwrapWords(
      render(createElement(ConnectView, { view: { kind: 'start', prompt: startPrompt('en') } })),
    );
    expect(html).toContain('otea connect --as &lt;name&gt; --model &lt;model&gt;');
    expect(html).toContain('Set up Otea in this project');
    expect(html).toContain('Copy the instruction');
    setLanguage('es');
  });

  it('Emparejar un teléfono asks this computer’s browser to sign in when it cannot manage devices', () => {
    setLanguage('es');
    const html = render(createElement(LanPanel, { canManage: false }));
    expect(html).toContain('Emparejar un teléfono');
    expect(html).toContain('otea open');
    expect(html).toContain('>Hecho</button>');
  });

  it('Emparejar un teléfono says, above the QR on Tailscale, to connect Tailscale on the phone first', () => {
    setLanguage('es');
    const html = render(createElement(BeforeScan, { tailscale: true }));
    expect(html).toContain('class="lan-before" role="note"');
    expect(html).toContain(
      'Antes de escanear: abre Tailscale en el teléfono y comprueba que está conectado.',
    );
    expect(render(createElement(BeforeScan, { tailscale: false }))).toBe('');
  });
});
