// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moveItem } from '../../api.ts';
import { AppTestProvider } from '../../app/context.tsx';
import { ago, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { testApp } from '../../shell/test-app.ts';
import {
  buttonNamed,
  type Mounted,
  mount,
  press,
  type Sent,
  settle,
  stubServer,
  typeInto,
} from '../../test-dom.tsx';
import type { CollectionView, Item, ItemView } from '../../types.ts';
import { Tray } from './Tray.tsx';

// What a bulk move sends: the tray under ticked rows moves each ticked item, one after another,
// through the move the person pressed; Devolver asks its reason once, for all of them.

const bug = officialType('bug-triage');
const errores = {
  name: 'Errores',
  prefix: 'ERR',
  preset: 'bug-triage',
  types: [bug],
} as unknown as CollectionView;

const row = (id: string): Item => ({
  id,
  collection: 'Errores',
  type: bug.name,
  title: `Error ${id}`,
  fields: {},
  presetVersion: 3,
  state: 'verify',
  turn: 'human',
  createdAt: ago(90),
  updatedAt: ago(10),
  createdBy: { kind: 'agent', name: 'Scout' },
  lease: null,
});

// Each ticked item as the server reads it: the moves it can take where it stands.
const view = (id: string): ItemView => ({
  ...row(id),
  events: [],
  transitions: [
    { to: 'fixed', by: 'human-ui', reasonRequired: false, turn: 'none', closes: 'done' },
    { to: 'fixing', by: 'human', reasonRequired: true, turn: 'agent' },
  ],
  relayable: [],
  missing: [],
  evidence: [],
  relations: [],
});

let page: Mounted | undefined;
let sent: Sent[];

beforeEach(() => {
  setLanguage('es');
  // Each move waits for the list to carry the last one (handedOff): frames and the clock advance
  // only when the test says so.
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  sent = stubServer((path) => {
    const id = /\/api\/items\/([^/]+)$/.exec(path)?.[1];
    return id
      ? view(decodeURIComponent(id))
      : path.endsWith('/api/boards')
        ? { boards: [] }
        : undefined;
  });
});
afterEach(() => {
  page?.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setLanguage('en');
});

const app = testApp({
  collections: [errores],
  move: (id, to, reason = '', _toast, choice) => moveItem(id, to, reason, choice),
});

const tray = async (ids: string[]) => {
  page = mount(
    <AppTestProvider value={app}>
      <Tray
        items={ids.map(row)}
        collection={errores}
        onUntick={() => undefined}
        onKeep={() => undefined}
        onClear={() => undefined}
      />
    </AppTestProvider>,
  );
  await settle();
  return page.root;
};

// Lets a run go through every item: each one's handoff wait ends.
const runThrough = async (items: number) => {
  for (let i = 0; i < items; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await settle();
  }
};

describe('a bulk move from the tray', () => {
  it('sends Aprobar for each ticked item, in the order ticked', async () => {
    const root = await tray(['ERR-1', 'ERR-2']);
    await press(buttonNamed(root, 'Aprobar'));
    await runThrough(2);

    expect(sent).toEqual([
      { method: 'POST', url: '/api/items/ERR-1/move', body: { to: 'fixed' } },
      { method: 'POST', url: '/api/items/ERR-2/move', body: { to: 'fixed' } },
    ]);
  });

  it('sends Devolver with the one reason typed, to each item, and nothing before it', async () => {
    const root = await tray(['ERR-1', 'ERR-2']);
    await press(buttonNamed(root, 'Devolver…'));
    expect(buttonNamed(root, 'Enviar')?.disabled).toBe(true);
    expect(sent).toEqual([]);

    await typeInto(root.querySelector('.tnote input'), ' Faltan las pruebas ');
    await press(buttonNamed(root, 'Enviar'));
    await runThrough(2);

    const back = { to: 'fixing', reason: 'Faltan las pruebas' };
    expect(sent).toEqual([
      { method: 'POST', url: '/api/items/ERR-1/move', body: back },
      { method: 'POST', url: '/api/items/ERR-2/move', body: back },
    ]);
  });
});
