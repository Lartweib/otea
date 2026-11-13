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

  it('keeps its sections once there is a board', () => {
    const html = render(
      fake({ all: [item({ id: 'ERR-1' })], collections: [errores as unknown as CollectionView] }),
    );
    expect(html).toContain('class="lanes');
  });
});

describe('Te toca on the phone (mobile mock 1)', () => {
  const app = (phone: boolean) =>
    fake({
      all: [item({ id: 'ERR-1' })],
      collections: [errores as unknown as CollectionView],
      phone,
    });

  it('leaves the agents column out: the agents live in the menu up top', () => {
    expect(render(app(false))).toContain('class="agents"');
    expect(render(app(true))).not.toContain('class="agents"');
  });
});
