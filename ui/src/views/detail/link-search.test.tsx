// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { linkItems } from '../../api.ts';
import { AppTestProvider } from '../../app/context.tsx';
import { item as row } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { setMotionPref } from '../../motion/reduced.ts';
import { linkRequestOf } from '../../relations.ts';
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
import type { Item, ItemView } from '../../types.ts';
import { LinksSection } from './BoardSections.tsx';
import { linksOf } from './board-item.ts';
import { Structure } from './Structure.tsx';

// Linking an item from its page: the search in «vincular» (Structure's link well) and the blocks
// pickers of a board item («Lo frena…», «Frena a…»), checked at what they offer and at the request
// a pick sends. The app's link runs api.ts's linkItems on linkRequestOf (app/context.tsx), as here.

const all: Item[] = [
  row({ id: 'ERR-214', title: 'Los lobos no cruzan el puente' }),
  row({ id: 'ERR-215', title: 'El puente cruje de noche' }),
  row({ id: 'ERR-216', title: 'Un puente roto en Mirefall' }),
  row({ id: 'ERR-300', title: 'La niebla tapa el mapa' }),
  row({ id: 'TAR-7', collection: 'Tareas', title: 'Pintar el puente' }),
  row({ id: 'TAR-8', collection: 'Tareas', title: 'Cerrada', turn: 'none', closes: 'done' }),
  row({ id: 'TAR-9', collection: 'Tareas', title: 'Su parte' }),
];

const page: ItemView = {
  ...row({ id: 'ERR-214', title: 'Los lobos no cruzan el puente' }),
  events: [],
  transitions: [],
  relayable: [],
  missing: [],
  evidence: [],
  // Already linked: ERR-216 relates to it; TAR-9 is its part.
  relations: [
    {
      kind: 'relates',
      id: 'ERR-216',
      title: 'Un puente roto en Mirefall',
      state: 'verify',
      turn: 'human',
    },
    { kind: 'child', id: 'TAR-9', title: 'Su parte', state: 'verify', turn: 'human' },
  ],
} as unknown as ItemView;

let mounted: Mounted | undefined;
let sent: Sent[];

beforeEach(() => {
  setLanguage('es');
  // Reduced motion: a pick lands at once, with no 120 ms flash of the row first.
  setMotionPref('reduced');
  sent = stubServer();
});
afterEach(() => {
  mounted?.unmount();
  vi.unstubAllGlobals();
  setMotionPref('system');
  setLanguage('en');
});

const app = testApp({
  all,
  link: (id, kind, other) => linkItems(linkRequestOf(id, kind, other)),
});

const offered = (root: HTMLElement, selector: string) =>
  [...root.querySelectorAll(selector)].map((el) => el.textContent ?? '');

describe('the link search on the item page', () => {
  const open = async () => {
    mounted = mount(
      <AppTestProvider value={app}>
        <Structure item={page} />
      </AppTestProvider>,
    );
    await press(buttonNamed(mounted.root, 'vincular'));
    return mounted.root;
  };

  it('finds items on every board by title, never the item itself or what it already links', async () => {
    const root = await open();
    await typeInto(root.querySelector('input[type="text"]'), 'PUENTE');

    const ids = offered(root, '[role="option"] .id');
    expect(ids).toEqual(['ERR-215', 'TAR-7']);
  });

  it('finds an item by its id, and links the one picked', async () => {
    const root = await open();
    await typeInto(root.querySelector('input[type="text"]'), 'err-30');
    expect(offered(root, '[role="option"] .id')).toEqual(['ERR-300']);

    await press(root.querySelector('[role="option"]'));
    expect(sent).toEqual([
      {
        method: 'POST',
        url: '/api/items/ERR-214/link',
        body: { kind: 'relates', other: 'ERR-300' },
      },
    ]);
  });

  it('says nothing matches a search that finds nothing', async () => {
    const root = await open();
    await typeInto(root.querySelector('input[type="text"]'), 'dragón');

    expect(offered(root, '[role="option"]')).toEqual([]);
    expect(root.textContent).toContain('Nada con ese nombre.');
  });
});

describe('the blocks pickers of a board item', () => {
  // Held back already by ERR-215; TAR-9 is its part.
  const held: ItemView = {
    ...page,
    relations: [
      {
        kind: 'blocked_by',
        id: 'ERR-215',
        title: 'El puente cruje de noche',
        state: 'verify',
        turn: 'human',
      },
      { kind: 'child', id: 'TAR-9', title: 'Su parte', state: 'verify', turn: 'human' },
    ],
  } as unknown as ItemView;

  // The picker opens in the page's pop layer, outside the section.
  const open = async (label: string) => {
    mounted = mount(
      <AppTestProvider value={app}>
        <LinksSection
          item={held}
          links={linksOf(held, () => ({ board: 'Errores' }))}
          canWrite
          now={0}
          boardOf={(x) => x.collection}
        />
      </AppTestProvider>,
    );
    await press(buttonNamed(mounted.root, label));
    return document.body;
  };
  const pick = (body: HTMLElement, id: string) =>
    [...body.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.includes(id));

  it('offers the open items of every board, never the item, its parts or what already holds it', async () => {
    const body = await open('Lo frena…');

    const ids = offered(body, '[role="menuitem"]').map((text) => /^[A-Z]+-\d+/.exec(text)?.[0]);
    expect(ids).toEqual(['ERR-216', 'ERR-300', 'TAR-7']);
  });

  it('records «Lo frena» as the other item blocking this one', async () => {
    const body = await open('Lo frena…');
    await press(pick(body, 'ERR-300'));

    expect(sent).toEqual([
      {
        method: 'POST',
        url: '/api/items/ERR-300/link',
        body: { kind: 'blocks', other: 'ERR-214' },
      },
    ]);
  });

  it('records «Frena a» as this item blocking the other', async () => {
    const body = await open('Frena a…');
    await press(pick(body, 'TAR-7'));

    expect(sent).toEqual([
      { method: 'POST', url: '/api/items/ERR-214/link', body: { kind: 'blocks', other: 'TAR-7' } },
    ]);
  });
});
