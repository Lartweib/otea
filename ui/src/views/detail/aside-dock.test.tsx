import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tareasDeRepo } from '../../../../src/core/board/testing.ts';
import { type App, AppTestProvider } from '../../app/context.tsx';
import { ago, NOW } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { CollectionView, ItemEvent, ItemView } from '../../types.ts';
import type { StudioBoard } from '../board/studio-board.tsx';
import { ItemSheet } from './ItemSheet.tsx';

// P5-R3-11: on the phone, an item an agent set aside kept Retomar mid-page, while the bar docked at
// the bottom offered only «Dejar una nota».
const seen = vi.hoisted(() => ({ board: null as StudioBoard | null }));
vi.mock('../board/studio-board.tsx', async (actual) => ({
  ...(await actual<typeof import('../board/studio-board.tsx')>()),
  useStudioBoard: () => seen.board,
}));

const tareas = { name: 'Tareas', prefix: 'TAR', types: [] } as unknown as CollectionView;
const you = { kind: 'human', name: 'fede' } as const;
const kiln = { kind: 'agent', name: 'kiln' } as const;
const ev = (id: number, type: string, actor: ItemEvent['actor'], data: object, m: number) =>
  ({ id, type, actor, at: ago(m), data }) as ItemEvent;

// Implementar, an agent's step, which kiln took and set aside for later.
const aside: ItemView = {
  id: 'TAR-7',
  collection: 'Tareas',
  type: 'Tarea de repo',
  title: 'Quitar el parpadeo',
  fields: {},
  presetVersion: 1,
  state: 'simpl',
  turn: 'agent',
  createdAt: ago(60),
  updatedAt: ago(5),
  createdBy: you,
  lease: null,
  setAside: { by: 'kiln', at: ago(10) },
  events: [
    ev(1, 'created', you, { state: 'sprop' }, 60),
    ev(2, 'transitioned', you, { from: 'sprop', to: 'simpl' }, 30),
    ev(3, 'claimed', kiln, { holder: 'kiln' }, 20),
    ev(4, 'released', kiln, { holder: 'kiln', cause: 'later' }, 10),
  ],
  transitions: [],
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
  collections: [tareas],
  collectionOf: (n: string) => (n === 'Tareas' ? tareas : undefined),
  agents: [],
  feed: [],
  route: { view: 'toca', item: 'TAR-7' },
  phone: true,
} as unknown as App;

const render = (item: ItemView) =>
  renderToStaticMarkup(
    <AppTestProvider value={app}>
      <ItemSheet
        item={item}
        full={false}
        nav={{ prev: false, next: false }}
        onNav={() => undefined}
        onFull={() => undefined}
        onClose={() => undefined}
      />
    </AppTestProvider>,
  );

beforeEach(() => {
  seen.board = { id: 'b-tareas', version: 1, changed: false, live: tareasDeRepo() };
});
afterEach(() => setLanguage('en'));

describe('the phone’s bar on an item set aside', () => {
  it('docks Retomar beside «Dejar una nota», and Retomar shows once', () => {
    setLanguage('es');
    const html = render(aside);
    const dock = html.slice(html.indexOf('class="p-dock"'));
    expect(html).toContain('class="p-dock"');
    expect(dock).toMatch(/<button[^>]*data-resume=""[^>]*>Retomar<\/button>/);
    expect(dock).toContain('Dejar una nota');
    expect(dock).toContain('Retomar · vuelve a la cola de');
    expect(html.match(/data-resume=""/g)).toHaveLength(1);
  });

  it('docks only «Dejar una nota» once it is taken up again', () => {
    setLanguage('es');
    const { setAside: _lifted, ...back } = aside;
    const html = render(back);
    expect(html).toContain('Dejar una nota');
    expect(html).not.toContain('data-resume');
  });
});
