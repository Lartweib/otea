import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { type App, AppTestProvider } from '../../app/context.tsx';
import { ago, NOW, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { CollectionView, ItemEvent, ItemView } from '../../types.ts';
import { ItemSheet } from './ItemSheet.tsx';

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

const render = () =>
  renderToStaticMarkup(
    <AppTestProvider value={app}>
      <ItemSheet
        item={item}
        full={false}
        nav={{ prev: false, next: true }}
        onNav={() => undefined}
        onFull={() => undefined}
        onClose={() => undefined}
      />
    </AppTestProvider>,
  );

describe('the item sheet', () => {
  it('lays out the bar, the headline, the route, the moves, details, body and history', () => {
    const html = render();
    for (const cls of [
      'sheet-bar',
      'crumb',
      'bar-r',
      'headline',
      'standfirst',
      'route-wrap',
      'acts',
      'd-details',
      'd-line',
      'd-main',
      'd-hist',
    ])
      expect(html).toContain(`class="${cls}`);
    expect(html.match(/data-c="true"/g)?.length).toBeGreaterThanOrEqual(7);
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
    expect(html).toContain('Personalizar vista');
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

  it('disables Previous at the start of the list', () => {
    expect(render()).toMatch(/data-nav="-1"[^>]*disabled=""/);
  });
});
