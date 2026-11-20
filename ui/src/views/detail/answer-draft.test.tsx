// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type App, AppTestProvider } from '../../app/context.tsx';
import { ago, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { testApp } from '../../shell/test-app.ts';
import { buttonNamed, type Mounted, mount, press, stubServer, typeInto } from '../../test-dom.tsx';
import type { CollectionView, ItemView } from '../../types.ts';
import { ItemSheet } from './ItemSheet.tsx';

// P6-R3-6: on the phone, an answer typed on an item page was lost after Android Back, which closes
// the page. The unsent answer is kept per item, as the note drafts are, until it is sent.

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
  state: 'fixing',
  turn: 'human',
  asks: { question: 1, by: 'Scout', text: '¿Arreglo también el río?', at: ago(5) },
  createdAt: ago(900),
  updatedAt: ago(5),
  createdBy: { kind: 'agent', name: 'Scout' },
  lease: null,
  events: [],
  transitions: [],
  relayable: [],
  missing: [],
  evidence: [],
  relations: [],
};

let page: Mounted | undefined;
let answered: string[];

beforeEach(() => {
  setLanguage('es');
  stubServer();
  window.localStorage.clear();
  answered = [];
});
afterEach(() => {
  page?.unmount();
  page = undefined;
  vi.unstubAllGlobals();
  window.localStorage.clear();
  setLanguage('en');
});

const app: App = testApp({
  collections: [errores],
  answer: async (_id, text) => {
    answered.push(text);
  },
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

const box = (root: HTMLElement) => root.querySelector<HTMLTextAreaElement>('.qa textarea');

describe('an answer typed and not sent', () => {
  it('is there again when the item page opens again, until it is sent', async () => {
    await typeInto(box(open()), 'Sí, el río también');
    page?.unmount();

    const again = open();
    expect(box(again)?.value).toBe('Sí, el río también');

    await press(buttonNamed(again, 'Enviar respuesta'));
    expect(answered).toEqual(['Sí, el río también']);
    page?.unmount();
    expect(box(open())?.value).toBe('');
  });
});
