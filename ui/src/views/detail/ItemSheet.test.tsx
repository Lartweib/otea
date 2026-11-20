import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { type App, AppTestProvider } from '../../app/context.tsx';
import { ago, inMinutes, NOW, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { CollectionView, ItemEvent, ItemView } from '../../types.ts';
import { Acts } from './Acts.tsx';
import type { Facts } from './facts.ts';
import { ItemSheet, leaveSays } from './ItemSheet.tsx';
import { type MoveChoice, planMoves } from './moves.ts';

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
): ItemEvent => ({
  id: ++seq,
  type,
  actor,
  at: ago(m),
  data,
});
const mender = { kind: 'agent', name: 'Mender' } as const;
const you = { kind: 'human', name: 'fede' } as const;

const item: ItemView = {
  id: 'ERR-214',
  collection: 'Errores',
  type: bug.name,
  title: 'Los lobos no cruzan el puente de cuerda en Mirefall',
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
  evidence: [],
  relations: [],
};

const app = {
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
  phone: false,
} as unknown as App;

const render = (shown: ItemView = item, value: App = app) =>
  renderToStaticMarkup(
    <AppTestProvider value={value}>
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

describe('the item sheet', () => {
  it('says a note reaches "el agente" with the contraction Spanish needs', () => {
    setLanguage('es');
    expect(leaveSays(null)).toBe(
      'le llega al agente la próxima vez que consulte Otea · no cambia paso, ronda ni reserva',
    );
    expect(renderToStaticMarkup(<>{leaveSays('Mender')}</>)).toContain('le llega a <b>Mender</b>');
  });

  it('lets the person attach a file to an open item, and not to a closed one', () => {
    setLanguage('es');
    expect(render()).toContain('>Adjuntar<');
    expect(render()).toContain('type="file"');
    expect(render({ ...item, state: 'fixed', turn: 'none', transitions: [] })).not.toContain(
      '>Adjuntar<',
    );
  });

  it('names its icon-only buttons, so a narrow bar still reads them', () => {
    const html = render();
    expect(html).toMatch(
      /class="[^"]*ampliar[^"]*"[^>]*aria-label="[^"]+"|aria-label="[^"]+"[^>]*class="[^"]*ampliar/,
    );
  });

  it('says who hands it to you in which round, and the moves from its transitions', () => {
    setLanguage('es');
    const html = render();
    expect(html).toContain('<b>Mender</b> te lo entrega en la ronda 2.');
    expect(html).toContain('>Aprobar<');
    expect(html).toContain('>Devolver…<');
    expect(html).toContain('cerrar como');
    expect(html).toContain('Aprobar <b>→ ');
    expect(html).toContain('tu turno');
    // Editar tablero shows only for a board Studio shapes; this one is not among the boards read.
    expect(html).not.toContain('Editar tablero');
    expect(html).not.toContain('#/customize');
  });

  it('reads the agent and your notes in the body, and the history newest first', () => {
    setLanguage('es');
    const html = render();
    expect(html).toContain('Mender dice');
    expect(html).toContain('Ya cruzan.');
    expect(html).toContain('Tus notas');
    expect(html).toContain('El último se queda.');
    expect(html).toContain('6 eventos');
    expect(html.indexOf('Lo entregó otra vez')).toBeLessThan(html.indexOf('Lo creó en'));
  });

  it('waits for the agent you left a stuck item for, or for any agent once back in the queue', () => {
    setLanguage('es');
    const kiln = { kind: 'agent', name: 'kiln' } as const;
    const stuck = (data: Record<string, unknown>): ItemView => ({
      ...item,
      state: 'fixing',
      turn: 'agent',
      events: [
        ev('transitioned', kiln, { from: 'accepted', to: 'fixing' }, 60),
        ev('claimed', kiln, { holder: 'kiln' }, 59),
        ev('released', you, { holder: 'kiln', ...data }, 1),
      ],
    });
    expect(render(stuck({ cause: 'reassign', next: 'quill' }))).toContain(
      'Se lo dejaste a <b>quill</b>.',
    );
    expect(render(stuck({ cause: 'restart' }))).toContain('Espera a un agente.');
  });

  // P7-R2-9: every review read «Nadie está escuchando» in red, even where Aprobar closes the item
  // and only Devolver, not chosen, hands it to an agent; and while the agent plainly worked.
  describe('beside a move that hands the item to an agent', () => {
    const lone = { name: 'Mender', harness: null, holding: [], lastSeen: ago(10), live: true };
    const onward: ItemView = {
      ...item,
      transitions: [
        { to: 'fixed', by: 'human-ui', reasonRequired: false, turn: 'agent' },
        ...item.transitions.slice(1),
      ],
    };
    const withAgents = (agents: object[]) => ({ ...app, agents }) as App;

    it('says nothing of listening where Aprobar closes the item and Devolver is not chosen', () => {
      expect(render(item, withAgents([{ ...lone, waiting: false }]))).not.toContain('data-unheard');
    });

    it('says nobody is listening beside an Aprobar that hands it on while no agent waits or works', () => {
      const silent = render(onward, withAgents([{ ...lone, waiting: false }]));
      expect(silent).toContain('data-unheard');
      expect(silent).toContain('<b>Nobody is listening.</b>');
      expect(silent).toContain('<code>otea wait --turn agent --unclaimed</code>');
      expect(render(onward, withAgents([{ ...lone, waiting: true }]))).not.toContain(
        'data-unheard',
      );
    });

    it('says calmly that the agent at work will see it when it waits again', () => {
      setLanguage('es');
      const busy = { ...lone, waiting: false, holding: ['ERR-300'] };
      const html = render(onward, withAgents([busy]));
      expect(html).toContain('data-unheard="calm"');
      expect(html).toContain('Mender está trabajando; lo verá cuando vuelva a esperar.');
      expect(html).not.toContain('Nadie está escuchando');
      // kiln holds nothing, and called Otea a minute ago: at work between two items (P7-R2-9).
      const two = [busy, { ...busy, name: 'kiln', lastSeen: ago(1), actedAt: ago(1), holding: [] }];
      expect(render(onward, withAgents(two))).toContain(
        '2 agentes están trabajando; lo verán cuando vuelvan a esperar.',
      );
    });

    it('says it beside Devolver once its notes are open', () => {
      const plan = planMoves(item.transitions, { own: false, word: (s) => s });
      const back = plan.quiet.find((c) => c.kind === 'sendback') ?? null;
      const facts: Facts = {
        agent: 'Mender',
        left: false,
        handed: null,
        round: 2,
        question: false,
        own: false,
        mine: null,
        answered: null,
        visited: [],
        sentBack: [],
      };
      const acts = (notesOpen: MoveChoice | null) =>
        renderToStaticMarkup(
          <AppTestProvider value={withAgents([{ ...lone, waiting: false }])}>
            <Acts
              item={item}
              type={bug}
              facts={facts}
              look="yours"
              plan={plan}
              mode="moves"
              word={(s) => s}
              notesOpen={notesOpen}
              onNotes={() => undefined}
            />
          </AppTestProvider>,
        );
      expect(acts(null)).not.toContain('data-unheard');
      expect(acts(back)).toContain('<b>Nobody is listening.</b>');
    });
  });

  // P8-R2-7: the header only said «Espera a un agente» while nobody would bring one.
  it('says in the header that nobody is listening on an item that waits for an agent', () => {
    setLanguage('es');
    const queued: ItemView = { ...item, state: 'fixing', turn: 'agent', events: [] };
    const lone = { name: 'Mender', harness: null, holding: [], lastSeen: ago(30), live: true };
    const silent = render(queued, { ...app, agents: [{ ...lone, waiting: false }] } as App);
    expect(silent).toContain('>Espera a un agente. Nadie está escuchando.</span></p>');
  });

  // P7-R2-9: while claude-haiku handed off one item and claimed the next, the item waiting for an
  // agent read «Nadie está escuchando» in red, on and off: it called Otea moments before.
  it('says calmly that an agent at work between two items will see an item that waits for one', () => {
    setLanguage('es');
    const queued: ItemView = { ...item, state: 'fixing', turn: 'agent', events: [] };
    const haiku = { name: 'claude-haiku', harness: null, holding: [], live: true, waiting: false };
    const between = { ...haiku, lastSeen: ago(0.5), actedAt: ago(0.5), listening: true };
    const html = render(queued, { ...app, agents: [between] } as App);
    expect(html).toContain('data-unheard="calm"');
    expect(html).toContain('claude-haiku está trabajando; lo verá cuando vuelva a esperar.');
    expect(html).not.toContain('data-unheard=""');
    const idle = { ...haiku, lastSeen: ago(0.5), actedAt: ago(10), listening: true };
    expect(render(queued, { ...app, agents: [idle] } as App)).toContain(
      '<b>Nadie está escuchando.</b>',
    );
  });

  // P7-R3-10: after /exit the header said «claude-haiku lo está haciendo» for 15 minutes, the
  // lease's lifetime: its session is no longer heard, and the lease alone keeps the item.
  describe('an item whose holder is no longer connected', () => {
    const haiku = { kind: 'agent', name: 'claude-haiku' } as const;
    const held: ItemView = {
      ...item,
      state: 'fixing',
      turn: 'agent',
      lease: { holder: 'claude-haiku', expiresAt: inMinutes(12) },
      events: [ev('claimed', haiku, { holder: 'claude-haiku' }, 6)],
    };
    const holder = {
      name: 'claude-haiku',
      harness: null,
      holding: ['ERR-214'],
      lastSeen: ago(4),
      actedAt: ago(4),
      live: false,
      waiting: false,
    };
    const withHolder = (o: object) => ({ ...app, agents: [{ ...holder, ...o }] }) as App;

    it('says its session ended and when the item goes back to the queue', () => {
      setLanguage('es');
      const html = render(held, withHolder({ sessionEnded: true }));
      expect(html).toContain(
        'La sesión de <b>claude-haiku</b> terminó; vuelve a la cola cuando venza su reserva.',
      );
      expect(html).not.toContain('lo está haciendo');
      setLanguage('en');
      expect(render(held, withHolder({ sessionEnded: true }))).toContain(
        '<b>claude-haiku</b>’s session ended; it goes back to the queue when its lease runs out.',
      );
    });

    // A command-line agent on a long step with no otea call is not told apart from an ended one.
    it('says how long it has been quiet when Otea cannot tell its session ended', () => {
      setLanguage('es');
      const html = render(held, withHolder({ sessionEnded: false }));
      expect(html).toContain(
        '<b>claude-haiku</b> no da señales desde hace 4 min; vuelve a la cola cuando venza su reserva.',
      );
      expect(html).not.toContain('lo está haciendo');
    });

    it('says it is on it while it is connected', () => {
      setLanguage('es');
      const html = render(held, withHolder({ live: true, lastSeen: ago(0.5) }));
      expect(html).toContain('<b>claude-haiku</b> lo está haciendo.');
    });
  });

  // P7-R3-1: the only agent set it aside for later, and the header said «Espera a un agente» with
  // «Nadie está escuchando»: the person waited for nothing.
  it('says which agent set it aside for later, offers Retomar, and raises no alarm', () => {
    setLanguage('es');
    const haiku = { kind: 'agent', name: 'claude-haiku' } as const;
    const aside: ItemView = {
      ...item,
      state: 'fixing',
      turn: 'agent',
      events: [
        ev('claimed', haiku, { holder: 'claude-haiku' }, 20),
        ev('released', haiku, { holder: 'claude-haiku', cause: 'later' }, 10),
      ],
      setAside: { by: 'claude-haiku', at: ago(10) },
    };
    const lone = { name: 'claude-haiku', harness: null, holding: [], lastSeen: ago(30) };
    const silent = { ...app, agents: [{ ...lone, live: true, waiting: false }] } as App;
    const html = render(aside, silent);
    expect(html).toContain('<b>claude-haiku</b> lo dejó para más adelante.');
    expect(html).not.toContain('Espera a un agente');
    expect(html).not.toContain('data-unheard');
    expect(html).not.toContain('Nadie está escuchando');
    expect(html).toMatch(/<button[^>]*data-resume=""[^>]*>Retomar<\/button>/);
    expect(html).toContain('Retomar · vuelve a la cola de');
    expect(html).toContain('también para claude-haiku');
    // Once taken up again, it waits for an agent, and says so while nobody listens.
    const { setAside: _lifted, ...back } = aside;
    const backHtml = render(back, silent);
    expect(backHtml).toContain('Espera a <b>claude-haiku</b>. Nadie está escuchando.');
    expect(backHtml).not.toContain('data-resume');
  });

  it('lets the person free a live lease, and says how long it has left, not the item’s age', () => {
    const held: ItemView = {
      ...item,
      state: 'fixing',
      turn: 'agent',
      lease: { holder: 'Mender', expiresAt: new Date(NOW + 18 * 60_000).toISOString() },
    };
    const html = render(held);
    expect(html).toContain('data-free');
    expect(html).toContain('Free it');
    expect(html).toContain('Mender · 18 min left');
    expect(render({ ...held, lease: null })).not.toContain('data-free');
  });

  it('disables Previous at the start of the list', () => {
    expect(render()).toMatch(/data-nav="-1"[^>]*disabled=""/);
  });
});
