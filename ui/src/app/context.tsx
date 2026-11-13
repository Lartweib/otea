import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { FeedEvent } from '../activity.ts';
import {
  linkItems,
  moveItem,
  postAnswer,
  postNote,
  reassignItem,
  restartItem,
  undoMove,
  undoRelease,
  unlinkItems,
  updateItemFields,
} from '../api.ts';
import type { IntakeParent } from '../components/NewItemForm.tsx';
import { type Connection, usePhone, useRoute } from '../hooks.ts';
import { toast } from '../kit/pop/toast.tsx';
import { rowOf } from '../lanes/dom.ts';
import { landed } from '../motion/bus.ts';
import type { SyncState } from '../offline/sync-state.ts';
import type { Agent } from '../presence.ts';
import { linkRequestOf, unlinkRequestOf } from '../relations.ts';
import type { Remote } from '../remote.ts';
import { hashOf, type Route, type ViewRoute } from '../selection.ts';
import type {
  CollectionView,
  Item,
  PresetView,
  ProjectOverview,
  ProjectView,
  RelatedItem,
  RelationView,
  TypeView,
} from '../types.ts';
import { useAppData } from './data.ts';
import { Q } from './queue.ts';
import { followRoute, workspace } from './workspace.ts';

// The app's shared state and actions (SPEC §6.3): every slice reads the data and acts through here.

export type AppData = {
  connection: Connection;
  version: number;
  // A 30 s beat.
  now: number;
  session: { canWrite: boolean; canConfigure: boolean; canManageDevices: boolean };
  // Whether the PC answers and when it last did; while it does not, writes wait (read-only) and
  // a quick capture goes to the queue, where the app can keep one.
  sync: SyncState;
  canCapture: boolean;
  project?: ProjectView;
  projects?: ProjectOverview[];
  items: Remote<Item[]>;
  all: Item[];
  collections: CollectionView[];
  // The boards have been read once: a board missing from them is not there.
  collectionsReady: boolean;
  collectionOf(name: string): CollectionView | undefined;
  presets: PresetView[];
  // The presets as loaded (the module catalog shows their loading); bumps when Studio writes.
  presetsRemote: Remote<PresetView[]>;
  studioWrites: number;
  agents: Agent[] | null | undefined;
  // The latest 200 project events, merged live.
  feed: FeedEvent[];
  route: Route;
  phone: boolean;
};

export type AppActions = {
  // Goes to a view, with nothing open.
  go(view: ViewRoute): void;
  // Opens an item in the current view when its row is there, else on its board.
  openItem(id: string): void;
  closeItem(): void;
  // A Q-ordered move. With a toast message, the toast offers Deshacer: the server takes the move
  // back while the toast is up, whatever the workflow allows.
  move(id: string, to: string, reason?: string, toast?: string): Promise<void>;
  // Fills fields of an item as the person, keyed by part id.
  update(id: string, fields: Record<string, string>): Promise<void>;
  // A note to the agent doing the item's step, optionally on a piece of evidence; it moves nothing.
  note(id: string, text: string, anchor?: { evidence: number; seconds?: number }): Promise<void>;
  // Your answer to an agent's question: the turn goes back to it, with no move to undo.
  answer(id: string, text: string, toast?: string): Promise<void>;
  // A stuck item: back in the queue of its step (restart), or left for an agent (reassign). Both
  // run as any change does (the lists' handoff), then the toast offers Deshacer: the lease that
  // ran out comes back while the toast is up.
  restart(id: string, toast: string): Promise<void>;
  reassign(id: string, agent: string, toast: string): Promise<void>;
  link(id: string, kind: RelationView, other: string): Promise<void>;
  unlink(id: string, relation: RelatedItem): Promise<void>;
  newItem(o?: { board?: string; parent?: IntakeParent }): void;
  openActivity(): void;
  closeActivity(): void;
  openConnect(): void;
  closeConnect(): void;
  // An agent's sheet beside the list, in place of any open item.
  openAgent(name: string): void;
  closeAgent(): void;
  studioChanged(): void;
};

export type App = AppData & AppActions;

const AppContext = createContext<App | null>(null);

const LISTS = new Set(['toca', 'atasco', 'board']);

// The type an item follows, from its board.
export function typeOfItem(
  item: Pick<Item, 'collection' | 'type'>,
  collectionOf: (name: string) => CollectionView | undefined,
): TypeView | undefined {
  const types = collectionOf(item.collection)?.types ?? [];
  return types.find((t) => t.name === item.type) ?? types[0];
}

// The route that opens an item: the current list's when the item's row is in it, else its board.
export function routeToOpen(
  route: Route,
  item: Pick<Item, 'id' | 'collection'>,
  inView: boolean,
): Route {
  if (LISTS.has(route.view) && inView) {
    const { item: _open, ...view } = route;
    return { ...view, item: item.id } as Route;
  }
  if (!item.collection) return { view: 'toca', item: item.id };
  return { view: 'board', board: item.collection, item: item.id };
}

const go = (route: Route) => {
  const hash = hashOf(route);
  if (window.location.hash !== hash) window.location.hash = hash;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const data = useAppData();
  const route = useRoute();
  const phone = usePhone();
  const ref = useRef({ data, route });
  ref.current = { data, route };

  // The new item page belongs to where it was opened: going anywhere else puts it away.
  const place = hashOf(route);
  const placeAt = useRef(route);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the place is the route, by its hash
  useEffect(() => {
    followRoute(workspace, placeAt.current, route);
    placeAt.current = route;
  }, [place]);

  const collectionOf = useCallback(
    (name: string) => ref.current.data.collections.find((c) => c.name === name),
    [],
  );

  const actions = useMemo<AppActions>(
    () => ({
      go(view) {
        workspace.set({ intake: null });
        go(view);
      },
      openItem(id) {
        const { data: d, route: r } = ref.current;
        const item = d.all.find((each) => each.id === id);
        workspace.set({ intake: null });
        go(routeToOpen(r, item ?? { id, collection: '' }, !!rowOf(id) || !item));
      },
      closeItem() {
        const { item: _open, ...view } = ref.current.route;
        go(view as ViewRoute);
      },
      async move(id, to, reason = '', message) {
        const before = ref.current.data.all.find((each) => each.id === id);
        await Q.run(() => moveItem(id, to, reason));
        if (message === undefined) return;
        // Line, then surface, then content: the toast comes once the item has landed.
        await landed();
        const back = before?.state;
        toast({
          msg: message,
          id,
          ...(back ? { undo: () => void Q.run(() => undoMove(id, back)) } : {}),
        });
      },
      async update(id, fields) {
        await Q.run(() => updateItemFields(id, fields));
      },
      async note(id, text, anchor) {
        await Q.run(() => postNote(id, text, anchor));
      },
      async answer(id, text, message) {
        await Q.run(() => postAnswer(id, text));
        if (message === undefined) return;
        await landed();
        toast({ msg: message, id });
      },
      async restart(id, message) {
        await Q.run(() => restartItem(id));
        await landed();
        toast({ msg: message, id, undo: () => void Q.run(() => undoRelease(id)) });
      },
      async reassign(id, agent, message) {
        await Q.run(() => reassignItem(id, agent));
        await landed();
        toast({ msg: message, id, undo: () => void Q.run(() => undoRelease(id)) });
      },
      async link(id, kind, other) {
        await Q.run(() => linkItems(linkRequestOf(id, kind, other)));
      },
      async unlink(id, relation) {
        await Q.run(() => unlinkItems(unlinkRequestOf(id, relation)));
      },
      newItem(o = {}) {
        workspace.set({ intake: o });
      },
      openActivity: () => workspace.set({ activity: true }),
      closeActivity: () => workspace.set({ activity: false }),
      openConnect: () => workspace.set({ connect: true }),
      closeConnect: () => workspace.set({ connect: false }),
      openAgent(name) {
        workspace.set({ intake: null, agent: name });
        const { item: open, ...view } = ref.current.route;
        if (open) go(view as ViewRoute);
      },
      closeAgent: () => workspace.set({ agent: null }),
      studioChanged: () => ref.current.data.studioChanged(),
    }),
    [],
  );

  const value: App = {
    connection: data.connection,
    version: data.version,
    now: data.now,
    session: data.session,
    sync: data.sync,
    canCapture: data.canCapture,
    ...(data.project ? { project: data.project } : {}),
    ...(data.projects ? { projects: data.projects } : {}),
    items: data.items,
    all: data.all,
    collections: data.collections,
    collectionsReady: data.collectionsReady,
    collectionOf,
    presets: data.presets,
    presetsRemote: data.presetsRemote,
    studioWrites: data.studioWrites,
    agents: data.agents,
    feed: data.feed,
    route,
    phone,
    ...actions,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp outside AppProvider');
  return app;
}

// For tests and previews: a provider over given data.
export function AppTestProvider({ value, children }: { value: App; children: ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
