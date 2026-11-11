import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from 'react';
import type { FeedEvent } from '../activity.ts';
import { linkItems, moveItem, unlinkItems } from '../api.ts';
import type { IntakeParent } from '../components/NewItemForm.tsx';
import { type Connection, usePhone, useRoute } from '../hooks.ts';
import { toast } from '../kit/pop/toast.tsx';
import { rowOf } from '../lanes/dom.ts';
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
import { workspace } from './workspace.ts';

// The app's shared state and actions (SPEC §6.3): every slice reads the data and acts through here.

export type AppData = {
  connection: Connection;
  version: number;
  // A 30 s beat.
  now: number;
  session: { canWrite: boolean; canConfigure: boolean; canManageDevices: boolean };
  project?: ProjectView;
  projects?: ProjectOverview[];
  items: Remote<Item[]>;
  all: Item[];
  collections: CollectionView[];
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
  // A Q-ordered move. With a toast message, the toast offers Deshacer when the new state has a
  // move of yours straight back.
  move(id: string, to: string, reason?: string, toast?: string): Promise<void>;
  link(id: string, kind: RelationView, other: string): Promise<void>;
  unlink(id: string, relation: RelatedItem): Promise<void>;
  newItem(o?: { board?: string; parent?: IntakeParent }): void;
  openActivity(): void;
  closeActivity(): void;
  openConnect(): void;
  closeConnect(): void;
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

// The move of yours straight back from `to` to `from`, when the type has one without a reason.
export function inverseMove(type: TypeView | undefined, from: string, to: string): boolean {
  return !!type?.transitions?.some(
    (m) => m.from === to && m.to === from && m.by !== 'agent' && !m.reasonRequired,
  );
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
        const type = before ? typeOfItem(before, collectionOf) : undefined;
        const back = before && inverseMove(type, before.state, to) ? before.state : undefined;
        toast({
          msg: message,
          id,
          ...(back ? { undo: () => void Q.run(() => moveItem(id, back, '')) } : {}),
        });
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
      studioChanged: () => ref.current.data.studioChanged(),
    }),
    [collectionOf],
  );

  const value: App = {
    connection: data.connection,
    version: data.version,
    now: data.now,
    session: data.session,
    ...(data.project ? { project: data.project } : {}),
    ...(data.projects ? { projects: data.projects } : {}),
    items: data.items,
    all: data.all,
    collections: data.collections,
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
