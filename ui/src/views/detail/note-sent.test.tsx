import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tareasDeRepo } from '../../../../src/core/board/testing.ts';
import { type App, AppTestProvider } from '../../app/context.tsx';
import type { ReaderNote } from '../../components/evidence/EvidenceViewer.tsx';
import { ago, NOW } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { CollectionView, Evidence, ItemEvent, ItemView } from '../../types.ts';
import type { StudioBoard } from '../board/studio-board.tsx';
import { ItemSheet } from './ItemSheet.tsx';

// P7-R3-4: a note left while no agent had taken the step yet said «Le dejaste una nota a el agente»,
// on the desk and on the phone. A server render runs no effect and no click, so the test reads the
// board the sheet is on and the sends it hands its reader and the phone, and catches the toast.
const seen = vi.hoisted(() => ({
  board: null as StudioBoard | null,
  desk: undefined as ReaderNote | undefined,
  phone: undefined as { send: (text: string, on: number | null) => Promise<boolean> } | undefined,
  toasts: [] as string[],
}));
vi.mock('../board/studio-board.tsx', async (actual) => ({
  ...(await actual<typeof import('../board/studio-board.tsx')>()),
  useStudioBoard: () => seen.board,
}));
vi.mock('../../components/evidence/DeskReader.tsx', () => ({
  DeskReader: ({ note }: { note?: ReaderNote }) => {
    seen.desk = note;
    return null;
  },
}));
vi.mock('./PhoneItem.tsx', async (actual) => ({
  ...(await actual<typeof import('./PhoneItem.tsx')>()),
  PhoneItem: ({ notes }: { notes?: { leave?: typeof seen.phone } }) => {
    seen.phone = notes?.leave;
    return null;
  },
}));
vi.mock('../../kit/index.ts', async (actual) => ({
  ...(await actual<typeof import('../../kit/index.ts')>()),
  toast: ({ msg }: { msg: string }) => seen.toasts.push(msg),
}));

const def = tareasDeRepo();
const tareas = { name: 'Tareas', prefix: 'TAR', types: [] } as unknown as CollectionView;
const you = { kind: 'human', name: 'fede' } as const;
const kiln = { kind: 'agent', name: 'kiln' } as const;
const ev = (id: number, type: string, actor: ItemEvent['actor'], data: object, m: number) =>
  ({ id, type, actor, at: ago(m), data }) as ItemEvent;
const diff = {
  id: 1,
  itemId: 'TAR-7',
  role: 'single',
  module: 'ecode',
  kind: 'file',
  filename: 'fix.diff',
  contentType: 'text/x-diff',
  size: 10,
  sha256: '',
  caption: null,
  createdAt: ago(5),
  actor: kiln,
  channel: 'cli',
} as Evidence;

// Implementar, an agent's step, waiting in its queue; with `taken`, kiln holds it.
const implementing = (taken: boolean): ItemView => ({
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
  lease: taken ? { holder: 'kiln', expiresAt: new Date(NOW + 30 * 60_000).toISOString() } : null,
  events: [
    ev(1, 'created', you, { state: 'sprop' }, 60),
    ev(2, 'transitioned', you, { from: 'sprop', to: 'simpl' }, 30),
    ...(taken ? [ev(3, 'claimed', kiln, { holder: 'kiln' }, 20)] : []),
  ],
  transitions: [],
  relayable: [],
  missing: [],
  evidence: [diff],
  relations: [],
});

const app = (phone: boolean) =>
  ({
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
    phone,
    note: async () => undefined,
  }) as unknown as App;

const render = (item: ItemView, phone: boolean) =>
  renderToStaticMarkup(
    <AppTestProvider value={app(phone)}>
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

// What the toast says once a note is sent from the desk's reader or the phone's note sheet.
async function sentFrom(where: 'desk' | 'phone', taken: boolean): Promise<string | undefined> {
  render(implementing(taken), where === 'phone');
  // The phone's send reads a recording's moment off the page: there is none on this one.
  vi.stubGlobal('document', { querySelector: () => null });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  const went =
    where === 'desk'
      ? await seen.desk?.onSend('Mira el diff', { evidence: diff.id })
      : await seen.phone?.send('Mira el diff', null);
  vi.unstubAllGlobals();
  expect(went).toBe(true);
  return seen.toasts.at(-1);
}

beforeEach(() => {
  seen.board = { id: 'b-tareas', version: 1, changed: false, live: def };
  seen.desk = undefined;
  seen.phone = undefined;
  seen.toasts = [];
});
afterEach(() => {
  setLanguage('en');
  vi.unstubAllGlobals();
});

describe('the toast once a note to the agent at work went', () => {
  for (const where of ['desk', 'phone'] as const) {
    it(`says «al agente» on the ${where} while no agent has taken the step, and the name once one has`, async () => {
      setLanguage('es');
      expect(await sentFrom(where, false)).toBe(
        'Le dejaste una nota al agente en «Quitar el parpadeo».',
      );
      expect(await sentFrom(where, true)).toBe(
        'Le dejaste una nota a kiln en «Quitar el parpadeo».',
      );
      setLanguage('en');
      expect(await sentFrom(where, false)).toBe(
        'You left the agent a note on “Quitar el parpadeo”.',
      );
      expect(await sentFrom(where, true)).toBe('You left kiln a note on “Quitar el parpadeo”.');
    });
  }
});
