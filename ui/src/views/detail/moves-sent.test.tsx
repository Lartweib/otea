// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moveItem } from '../../api.ts';
import { type App, AppTestProvider } from '../../app/context.tsx';
import { ago, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { testApp } from '../../shell/test-app.ts';
import {
  buttonNamed,
  type Mounted,
  mount,
  press,
  type Sent,
  stubServer,
  typeInto,
} from '../../test-dom.tsx';
import type { CollectionView, ItemView } from '../../types.ts';
import { ItemSheet } from './ItemSheet.tsx';

// What a press on the item page sends: Aprobar and Devolver as the person makes them, checked at
// the request the server gets. The app's move runs api.ts's moveItem (app/context.tsx), as here.

const bug = officialType('bug-triage');
const errores = {
  name: 'Errores',
  prefix: 'ERR',
  preset: 'bug-triage',
  types: [bug],
} as unknown as CollectionView;

const item: ItemView = {
  id: 'ERR-214',
  collection: 'Errores',
  type: bug.name,
  title: 'Los lobos no cruzan el puente',
  fields: { severity: 'high', category: 'gameplay' },
  presetVersion: 3,
  state: 'verify',
  turn: 'human',
  createdAt: ago(900),
  updatedAt: ago(14),
  createdBy: { kind: 'agent', name: 'Scout' },
  lease: null,
  events: [],
  transitions: [
    { to: 'fixed', by: 'human-ui', reasonRequired: false, turn: 'none', closes: 'done' },
    { to: 'fixing', by: 'human', reasonRequired: true, turn: 'agent' },
  ],
  relayable: [],
  missing: [],
  evidence: [],
  relations: [],
};

let page: Mounted | undefined;
let sent: Sent[];

beforeEach(() => {
  setLanguage('es');
  sent = stubServer();
});
afterEach(() => {
  page?.unmount();
  vi.unstubAllGlobals();
  setLanguage('en');
});

const app: App = testApp({
  collections: [errores],
  move: (id, to, reason = '', _toast, choice) => moveItem(id, to, reason, choice),
});

const open = () => {
  page = mount(
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
  return page.root;
};

describe('a move pressed on the item page', () => {
  it('sends Aprobar as the move to its state, with no reason', async () => {
    const root = open();
    await press(buttonNamed(root, 'Aprobar'));

    expect(sent).toEqual([
      { method: 'POST', url: '/api/items/ERR-214/move', body: { to: 'fixed' } },
    ]);
  });

  it('sends Devolver only with the reason typed, as the move back to the agent', async () => {
    const root = open();
    await press(buttonNamed(root, 'Devolver…'));
    expect(sent).toEqual([]);

    await typeInto(root.querySelector('.notes textarea'), '  El último lobo se queda.  ');
    await press(buttonNamed(root, 'Enviar'));

    expect(sent).toEqual([
      {
        method: 'POST',
        url: '/api/items/ERR-214/move',
        body: { to: 'fixing', reason: 'El último lobo se queda.' },
      },
    ]);
  });
});
