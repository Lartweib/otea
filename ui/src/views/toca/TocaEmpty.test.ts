import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type App, AppTestProvider } from '../../app/context.tsx';
import { item, NOW } from '../../derive/fixtures.ts';
import type { CollectionView, PresetView } from '../../types.ts';
import { TocaView } from './TocaView.tsx';

const Provider = AppTestProvider as unknown as FunctionComponent<{ value: App }>;
const errores = { name: 'Errores', preset: 'bug-triage', prefix: 'ERR', types: [] };
const tasks = { name: 'tasks', description: 'Tasks', types: [] } as unknown as PresetView;

const fake = (o: Partial<App>): App =>
  ({
    now: NOW,
    feed: [],
    agents: [],
    route: { view: 'toca' },
    project: { id: 'h', name: 'Hollowmere' },
    session: { canWrite: true, canConfigure: true, canManageDevices: true },
    items: { status: 'ready', value: o.all ?? [] },
    collectionOf: () => undefined,
    presets: [tasks],
    go: () => undefined,
    openItem: () => undefined,
    closeItem: () => undefined,
    openConnect: () => undefined,
    ...o,
  }) as unknown as App;

const render = (app: App, node: ReactNode = createElement(TocaView)) =>
  renderToStaticMarkup(createElement(Provider, { value: app }, node));

describe('Te toca with nothing to list yet', () => {
  // The project page (EmptyProject) loads its settings first, so the static render holds neither.
  it('lists no lanes when no board has an item, and offers no preset to start from', () => {
    const html = render(fake({ all: [], collections: [] }));
    expect(html).not.toContain('empty-first');
    expect(html).not.toContain('class="lanes');
  });
});

// P5-R3-6: the phone said «Nada espera por ti» for half a second while it loaded, before «Una
// cosa espera por ti».
describe('Te toca before its first load', () => {
  for (const phone of [true, false]) {
    it(`says it is loading, never that nothing waits (${phone ? 'phone' : 'desk'})`, () => {
      const html = render(
        fake({
          all: [],
          collections: [errores as unknown as CollectionView],
          items: { status: 'loading' },
          phone,
        }),
      );
      expect(html).toContain('Loading…');
      expect(html).not.toContain('Nothing is waiting for you.');
      expect(html).not.toContain('class="lanes');
      // Nor a recap of the day in zeros, before the day is known.
      expect(html).not.toMatch(/class="(p-)?recap"/);
    });
  }
});

describe('Te toca on the phone (mobile mock 1)', () => {
  const app = (phone: boolean) =>
    fake({
      all: [item({ id: 'ERR-1' })],
      collections: [errores as unknown as CollectionView],
      phone,
    });

  it('offers to connect an agent on the desk while none is connected, counting what waits', () => {
    const waiting = item({ id: 'ERR-2', turn: 'agent', state: 'fixing' });
    const html = render(
      fake({
        all: [item({ id: 'ERR-1' }), waiting],
        collections: [errores as unknown as CollectionView],
      }),
    );
    expect(html).toContain('class="noagents"');
    expect(html).toContain('No agent connected');
    expect(html).toContain('One item is on an agent’s turn');
    const live = { name: 'kiln', harness: null, holding: [], lastSeen: 'x', live: true };
    expect(
      render(
        fake({
          all: [waiting],
          collections: [errores as unknown as CollectionView],
          agents: [live],
        }),
      ),
    ).not.toContain('noagents');
    expect(render(app(true))).not.toContain('noagents');
  });
});
