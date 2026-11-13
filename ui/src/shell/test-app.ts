import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type App, AppTestProvider } from '../app/context.tsx';
import { NOW } from '../derive/fixtures.ts';

// A whole App value for the shell's markup tests: quiet defaults, overridden per test.
export function testApp(o: Partial<App> = {}): App {
  const noop = () => undefined;
  const collections = o.collections ?? [];
  return {
    connection: 'live',
    version: 1,
    now: NOW,
    session: { canWrite: true, canConfigure: true, canManageDevices: true },
    project: { id: 'hm', name: 'Hollowmere', icon: null },
    items: { status: 'ready', value: o.all ?? [] },
    all: [],
    collections,
    collectionsReady: true,
    collectionOf: (name) => collections.find((c) => c.name === name),
    presets: [],
    presetsRemote: { status: 'ready', value: [] },
    studioWrites: 0,
    agents: [],
    feed: [],
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

// The markup of a shell part inside an app.
export function renderIn(app: App, node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(AppTestProvider, { value: app } as { value: App; children: ReactNode }, node),
  );
}
