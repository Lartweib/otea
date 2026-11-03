import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  fetchCollections,
  fetchItem,
  fetchItems,
  fetchPresets,
  fetchProject,
  fetchProjects,
  fetchSession,
} from './api.ts';
import { applyAttention } from './attention-dom.ts';
import { catalogEntries } from './catalog.ts';
import { ActivityDrawer } from './components/ActivityDrawer.tsx';
import { BriefView } from './components/BriefView.tsx';
import { CollectionRail } from './components/CollectionRail.tsx';
import { EmptyDetail } from './components/EmptyDetail.tsx';
import { FirstRun } from './components/EmptyStates.tsx';
import { ItemDetail } from './components/ItemDetail.tsx';
import type { ChildrenOf, CollectionOf, Unfolding } from './components/ItemList.tsx';
import { LanguageNote } from './components/LanguageNote.tsx';
import { LanPanel } from './components/LanPanel.tsx';
import { ListPane } from './components/ListPane.tsx';
import { CatalogOverview, ModuleIndex, ModulePanel } from './components/ModuleCatalog.tsx';
import { useMenu } from './components/menu.ts';
import { type IntakeParent, NewItemForm } from './components/NewItemForm.tsx';
import { PreferencesButton } from './components/PreferencesButton.tsx';
import { ProjectSettings } from './components/ProjectSettings.tsx';
import { ProjectsInbox } from './components/ProjectsInbox.tsx';
import { Sheet } from './components/Sheet.tsx';
import { browserStorage, Divider, useSplit } from './components/Split.tsx';
import { Brand, Topbar } from './components/Topbar.tsx';
import { Triage } from './components/Triage.tsx';
import { useDetailMotion, useViewPrefs } from './components/workspace-motion.ts';
import {
  type Connection,
  useAttention,
  useBeat,
  useHideTier,
  useLive,
  useMediaQuery,
  usePhone,
  useRemote,
  useRoute,
} from './hooks.ts';
import { t, useLanguage } from './i18n/i18n.ts';
import { Button, Icon } from './kit/index.ts';
import { MODULES } from './modules/registry.ts';
import {
  COLLAPSED_KEY,
  EXPANDED_KEY,
  type Folds,
  parentOf,
  readCollapsed,
  toggleFold,
  writeCollapsed,
} from './nesting.ts';
import { pillState } from './presence.ts';
import type { Remote } from './remote.ts';
import { groupByTurn } from './sections.ts';
import { hashFor, ITEMS_HASH, TRIAGE_HASH } from './selection.ts';
import { Studio } from './studio/Studio.tsx';
import type { CollectionView, Item, ItemView, PresetView } from './types.ts';
import { useAgents } from './use-agents.ts';
import { inCollection, sidebarEntries } from './workspace.ts';

function Message({ children, muted = true }: { children: ReactNode; muted?: boolean }) {
  return <p className={muted ? 'pane-message t-small' : 'pane-message action-error'}>{children}</p>;
}

type DetailPaneProps = {
  id: string;
  item: Remote<ItemView | null>;
  canWrite: boolean;
  collectionOf: CollectionOf;
  layout?: 'pane' | 'unfold';
  onMoved?: () => void;
  onAddChild?: (parent: ItemView) => void;
  onClose?: (() => void) | undefined;
  itemOf?: ((id: string) => Item | undefined) | undefined;
  trayHost?: HTMLElement | null | undefined;
};

function DetailPane({
  id,
  item,
  canWrite,
  collectionOf,
  layout,
  onMoved,
  onAddChild,
  onClose,
  itemOf,
  trayHost,
}: DetailPaneProps) {
  if (item.status === 'failed') return <Message muted={false}>{item.message}</Message>;
  if (item.status === 'loading') return <Message>{t('common.loading')}</Message>;
  if (!item.value) return <Message>{t('app.notFound', { id })}</Message>;
  return (
    <ItemDetail
      item={item.value}
      canWrite={canWrite}
      collection={collectionOf(item.value.collection)}
      collectionOf={collectionOf}
      onAddChild={onAddChild}
      onClose={onClose}
      itemOf={itemOf}
      trayHost={trayHost}
      {...(layout ? { layout } : {})}
      {...(onMoved ? { onMoved } : {})}
    />
  );
}

type SelectedItemProps = Omit<DetailPaneProps, 'item'> & {
  version: number;
  connection: Connection;
};

function SelectedItem({ id, version, connection, ...rest }: SelectedItemProps) {
  const load = useCallback((signal: AbortSignal) => fetchItem(id, signal), [id]);
  return <DetailPane id={id} item={useRemote(load, version, connection)} {...rest} />;
}

// A collection's preset decides its fields and which state means "incomplete".
function collectionLookup(collections: Remote<CollectionView[]>): CollectionOf {
  const list = collections.status === 'ready' ? collections.value : [];
  return (name) => list.find((collection) => collection.name === name);
}

type CatalogProps = {
  name: string | undefined;
  presets: Remote<PresetView[]>;
  rail: ReactNode;
  sidebar: boolean;
};

// The module catalog: the project's sidebar, the index, the chosen module (or an overview).
function Catalog({ name, presets, rail, sidebar }: CatalogProps) {
  const entries = catalogEntries(MODULES, presets.status === 'ready' ? presets.value : []);
  const entry = entries.find((candidate) => candidate.name === name);
  return (
    <main className="layout catalog with-rail" data-sidebar={sidebar ? 'on' : 'off'}>
      {rail}
      <div className="list-pane">
        <ModuleIndex entries={entries} selected={name} />
      </div>
      <div className="detail-pane">
        <div className="detail-panel raised">
          {name === undefined ? (
            <CatalogOverview presets={presets} />
          ) : entry ? (
            <ModulePanel key={entry.name} entry={entry} presets={presets} />
          ) : presets.status === 'loading' ? (
            <Message>{t('common.loading')}</Message>
          ) : (
            <Message>{t('app.noModule', { name })}</Message>
          )}
        </div>
      </div>
    </main>
  );
}

// parent: the item a "+ child" opened the form for; the form starts in its collection.
// collection: the empty collection whose "New item in" opened it; the form starts there.
type Intake = {
  openedOn: string | undefined;
  parent?: IntakeParent;
  collection?: string | undefined;
};

// The parents this viewer folded (or, whose children are all closed, unfolded) in the list,
// remembered in this browser.
function useFolds(): [Folds, (id: string, settled: boolean) => void] {
  const [folds, setFolds] = useState<Folds>(() => ({
    collapsed: readCollapsed(browserStorage()),
    expanded: readCollapsed(browserStorage(), EXPANDED_KEY),
  }));
  const toggle = useCallback((id: string, settled: boolean) => {
    setFolds((current) => {
      const next = toggleFold(current, id, settled);
      writeCollapsed(browserStorage(), next.collapsed, COLLAPSED_KEY);
      writeCollapsed(browserStorage(), next.expanded, EXPANDED_KEY);
      return next;
    });
  }, []);
  return [folds, toggle];
}

// Each item's children, from every item listed (any collection).
function childrenIndex(items: readonly Item[]): ChildrenOf {
  const index = new Map<string, Item[]>();
  for (const item of items) {
    const parent = parentOf(item);
    if (parent !== undefined) index.set(parent, [...(index.get(parent) ?? []), item]);
  }
  return (id) => index.get(id) ?? [];
}

export function App() {
  // Every word on screen follows the language: a switch renders the whole app again.
  useLanguage();
  const { connection, version, presence } = useLive();
  const route = useRoute();
  const phone = usePhone();
  const selectedId = route.view === 'items' ? route.id : undefined;
  const items = useRemote(fetchItems, version, connection);
  const session = useRemote(fetchSession, 0, connection);
  // Studio writes presets and boards: what it changed is read again.
  const [studioWrites, setStudioWrites] = useState(0);
  const collections = useRemote(fetchCollections, studioWrites, connection);
  const presets = useRemote(fetchPresets, studioWrites, connection);
  const collectionOf = collectionLookup(collections);
  const canWrite = session.status === 'ready' && session.value.canWrite;
  const canManageDevices = session.status === 'ready' && session.value.canManageDevices === true;
  const [intake, setIntake] = useState<Intake>();
  // No collection yet: the first run, its preset chosen in the detail and drawn on the list's lanes.
  const [firstPreset, setFirstPreset] = useState<string>();
  const [activity, setActivity] = useState(false);
  // The split is a way of looking, not a place: it stays out of the hash, so links and history keep
  // pointing at items.
  const split = useSplit();
  const listPane = useHideTier();
  const [chosen, setCollection] = useState<string>();
  const names = collections.status === 'ready' ? collections.value.map((each) => each.name) : [];
  const firstRun =
    collections.status === 'ready' && names.length === 0 && presets.status === 'ready';
  // All work shows only with two collections or more; with one, that collection is the view.
  const allWorkShown = names.length >= 2;
  const collection = chosen ?? (names.length === 1 ? names[0] : undefined);
  const allItems = items.status === 'ready' ? items.value : [];
  // What waits for you anywhere, whatever collection is chosen: the brand, the favicon and the title.
  const attention = useAttention(allItems);
  const { yours, working } = attention;
  useEffect(() => applyAttention({ yours, working }), [yours, working]);
  const [folds, toggleChildren] = useFolds();
  const scoped = inCollection(allItems, collection);
  const grouped = groupByTurn(scoped);
  const collectionView = collection === undefined ? undefined : collectionOf(collection);
  const [prefs, setPrefs] = useViewPrefs(collectionView);
  const [morphing, setMorphing] = useState(false);
  const [bulkHost, setBulkHost] = useState<HTMLDivElement | null>(null);
  const [detailHost, setDetailHost] = useState<HTMLDivElement | null>(null);
  const creating =
    canWrite && route.view === 'items' && intake !== undefined && intake.openedOn === selectedId;
  const closeIntake = () => setIntake(undefined);
  const showCreated = (id: string) => {
    closeIntake();
    window.location.hash = hashFor(id);
  };
  const openIntake = (into?: string) => {
    // From the catalog, intake opens next to the item list (nothing is selected there).
    if (route.view === 'modules') window.location.hash = ITEMS_HASH;
    setIntake({ openedOn: selectedId, collection: into });
    // On a phone intake opens above the list.
    if (phone) window.scrollTo({ top: 0 });
  };
  const addChild = (parent: ItemView) => {
    const { id, title, type } = parent;
    setIntake({ openedOn: selectedId, parent: { id, title, type, collection: parent.collection } });
    if (phone) window.scrollTo({ top: 0 });
  };
  const project = useRemote(fetchProject, 0, connection);
  // Every project on this machine, for the switcher: read again as this project changes, and on a
  // slow beat for the others, which this server's live feed does not watch.
  const projectsBeat = useBeat(30_000);
  const projects = useRemote(fetchProjects, version * 1000 + projectsBeat, connection);
  const agents = useAgents(version, presence, connection);
  const wide = useMediaQuery('(min-width: 64rem)');
  // Between the phone and 64rem the sidebar stays folded to its rail: the list needs the room.
  const folded = !phone && (!split.sidebar || !wide);
  const panel = useMenu();
  const rail = sidebarEntries(names, allItems, collectionOf);
  // Intake needs a collection to file into: with none yet, the first run says how to add one.
  const create =
    canWrite && names.length > 0
      ? (into: string | undefined) => {
          panel.close();
          // A collection's own + lists it, unless All work already shows it: the new row is carried
          // onto its lane in view.
          if (into !== undefined && collection !== undefined && into !== collection) {
            setCollection(into);
          }
          openIntake(into);
        }
      : undefined;
  const railProps = {
    entries: rail,
    yoursTotal: rail.reduce((sum, entry) => sum + entry.yours, 0),
    openTotal: rail.reduce((sum, entry) => sum + entry.open, 0),
    selected: collection,
    allWork: allWorkShown,
    onCreate: create,
    modules: route.view === 'modules',
    studio: route.view === 'studio',
    lan: canManageDevices ? route.view === 'lan' : undefined,
    settings: route.view === 'settings',
  };
  const choose = (name: string | undefined) => {
    setCollection(name);
    panel.close();
    if (route.view !== 'items') window.location.hash = ITEMS_HASH;
  };
  const sidebarRail = (
    <CollectionRail
      {...railProps}
      onSelect={choose}
      folded={folded}
      onToggle={wide ? split.toggleSidebar : undefined}
      foot={phone ? null : <PreferencesButton folded={folded} />}
    />
  );
  const panelButton = phone ? (
    <span className="pill-anchor" ref={panel.ref}>
      <Button
        variant="quiet"
        icon
        className="panel-button"
        aria-label={t('shell.openPanel')}
        aria-expanded={panel.open}
        onClick={panel.toggle}
      >
        <Icon name="sidebar" />
      </Button>
      <Sheet menu={panel} label={t('rail.aria')} side="left">
        <CollectionRail
          {...railProps}
          onSelect={choose}
          folded={false}
          variant="panel"
          head={
            <div className="panel-head">
              <Brand attention={attention} id="panel-brand" />
              <Button
                variant="quiet"
                size="sm"
                icon
                aria-label={t('common.close')}
                onClick={panel.close}
              >
                <Icon name="close" />
              </Button>
            </div>
          }
          foot={<PreferencesButton phone />}
        />
      </Sheet>
    </span>
  ) : null;
  // On a phone the selected row unfolds into its detail, and the detail pane only holds intake.
  // A move made from the unfolded item folds it, and the row carries itself home.
  const fold = () => {
    window.location.hash = ITEMS_HASH;
  };
  const unfolding: Unfolding | undefined =
    phone && !creating
      ? {
          detail: (id) => (
            <SelectedItem
              key={id}
              id={id}
              version={version}
              connection={connection}
              canWrite={canWrite}
              collectionOf={collectionOf}
              layout="unfold"
              onMoved={fold}
              onAddChild={addChild}
            />
          ),
          onFold: fold,
        }
      : undefined;
  const openTriage = canWrite
    ? () => {
        window.location.hash = TRIAGE_HASH;
      }
    : undefined;
  const leaveTriage = () => {
    window.location.hash = ITEMS_HASH;
  };
  // Triage takes everything that waits for you, folded under a parent or not.
  const waiting = grouped.find((section) => section.turn === 'human')?.items ?? [];
  // A collection seen as a grid takes the grid's room (and keeps it while the views morph). While
  // nothing is open the grid takes all of it, with no divider and no empty detail beside it.
  const gridded = !phone && prefs !== undefined && (prefs.mode === 'grid' || morphing);
  const detailOff = gridded && !selectedId && !creating;
  // The grid pane's width once the workspace is the grid's.
  const gridPane = !selectedId && !creating ? split.grid.room - 9 : split.grid.width;
  const closeDetail = () => {
    window.location.hash = ITEMS_HASH;
  };
  useDetailMotion(split.workspace, gridded, detailOff, split.grid.room - 9, split.grid.width);
  return (
    <div className="app">
      <Topbar
        attention={attention}
        project={project.status === 'ready' ? project.value : undefined}
        folded={folded}
        phone={phone}
        connection={connection}
        agents={agents}
        pill={pillState(connection, agents)}
        items={allItems}
        collectionOf={collectionOf}
        panel={panelButton}
        onActivity={() => setActivity((open) => !open)}
        projects={projects.status === 'ready' ? projects.value : undefined}
      />
      {phone && create && route.view === 'items' && !selectedId && !creating ? (
        <button type="button" className="new-fab" onClick={() => openIntake(collection)}>
          <Icon name="plus" />
          {t('app.newItem')}
        </button>
      ) : null}
      {route.view === 'projects' ? (
        <ProjectsInbox version={version} connection={connection} />
      ) : route.view === 'settings' ? (
        <ProjectSettings
          version={version}
          connection={connection}
          canWrite={canWrite}
          rail={phone ? null : sidebarRail}
          sidebar={!folded}
        />
      ) : route.view === 'modules' ? (
        <Catalog
          name={route.name}
          presets={presets}
          rail={phone ? null : sidebarRail}
          sidebar={!folded}
        />
      ) : route.view === 'studio' ? (
        <Studio
          page={route.page}
          connection={connection}
          version={version}
          canWrite={canWrite}
          phone={phone}
          items={allItems}
          rail={phone ? null : sidebarRail}
          sidebar={!folded}
          onChanged={() => setStudioWrites((count) => count + 1)}
        />
      ) : route.view === 'lan' ? (
        <LanPanel
          canManage={canManageDevices}
          rail={phone ? null : sidebarRail}
          sidebar={!folded}
        />
      ) : route.view === 'triage' && canWrite ? (
        <main className="layout triage-layout">
          <Triage
            waiting={waiting}
            loading={items.status === 'loading'}
            collectionOf={collectionOf}
            version={version}
            onExit={leaveTriage}
          />
        </main>
      ) : route.view === 'brief' ? (
        <main className="brief-layout">
          <BriefView
            ids={route.ids}
            items={allItems}
            collections={collections.status === 'ready' ? collections.value : []}
            version={version}
          />
        </main>
      ) : (
        <main
          className="layout workspace with-rail"
          ref={split.attach}
          data-sidebar={folded ? 'off' : 'on'}
          data-view={gridded ? 'grid' : 'list'}
          data-detail={detailOff ? 'off' : undefined}
          style={
            {
              ...split.style,
              '--grid-w': `${detailOff ? split.grid.room - 9 : split.grid.width}px`,
            } as CSSProperties
          }
        >
          {phone ? (
            <CollectionRail
              {...railProps}
              onSelect={setCollection}
              folded={false}
              onCreate={undefined}
            />
          ) : (
            sidebarRail
          )}
          <div className="list-pane" data-pane="list" ref={listPane}>
            <ListPane
              items={items}
              scoped={scoped}
              allItems={allItems}
              folds={folds}
              onToggleChildren={toggleChildren}
              childrenOf={childrenIndex(allItems)}
              allWork={allWorkShown && collection === undefined}
              selectedId={selectedId}
              collection={collectionView}
              collectionName={collection}
              collectionOf={collectionOf}
              unfolding={unfolding}
              onTriage={openTriage}
              canWrite={canWrite}
              phone={phone}
              prefs={prefs}
              onPrefs={setPrefs}
              onMorphing={setMorphing}
              listWidth={split.width}
              gridWidth={gridPane}
              bulkHost={bulkHost}
              collections={collections.status === 'ready' ? names : undefined}
              presets={presets.status === 'ready' ? presets.value : []}
              firstPreset={firstPreset}
              onFirstPreset={setFirstPreset}
              agents={agents ? agents.map(({ name }) => name) : undefined}
              onCreate={canWrite ? () => openIntake(collection) : undefined}
            />
          </div>
          {/* The grid pane's cell again, over the scroller: the bulk tray docks to its bottom edge. */}
          {phone ? null : <div className="bulk-host" ref={setBulkHost} />}
          {phone ? null : gridded ? (
            <Divider
              key="grid"
              range="grid"
              workspace={split.workspace}
              width={split.grid.width}
              home={split.grid.home}
              onCommit={split.grid.commit}
              onReset={split.grid.reset}
            />
          ) : (
            <Divider
              key="list"
              workspace={split.workspace}
              width={split.width}
              home={split.home}
              onCommit={split.commitWidth}
              onReset={split.resetWidth}
            />
          )}
          {/* The detail pane's cell again: the tray for ticked children docks to its bottom edge. */}
          {phone ? null : <div className="bulk-host detail-bulk-host" ref={setDetailHost} />}
          {phone && !creating ? null : (
            <div className="detail-pane" data-pane="detail">
              <div className="detail-panel">
                {creating ? (
                  <NewItemForm
                    key={intake?.parent?.id ?? 'new'}
                    connection={connection}
                    ids={allItems.map(({ id }) => id)}
                    parent={intake?.parent}
                    collection={intake?.collection}
                    onCancel={closeIntake}
                    onCreated={showCreated}
                  />
                ) : selectedId ? (
                  <SelectedItem
                    key={selectedId}
                    id={selectedId}
                    version={version}
                    connection={connection}
                    canWrite={canWrite}
                    collectionOf={collectionOf}
                    onAddChild={addChild}
                    onClose={gridded ? closeDetail : undefined}
                    itemOf={(id) => allItems.find((each) => each.id === id)}
                    trayHost={detailHost}
                  />
                ) : detailOff || items.status !== 'ready' ? null : firstRun ? (
                  <FirstRun
                    presets={presets.value}
                    chosen={firstPreset}
                    onChoose={setFirstPreset}
                    route={false}
                  />
                ) : (
                  <EmptyDetail
                    items={scoped}
                    collection={collection}
                    onCreate={
                      canWrite && names.length > 0 ? () => openIntake(collection) : undefined
                    }
                  />
                )}
              </div>
            </div>
          )}
        </main>
      )}
      <ActivityDrawer
        open={activity}
        onClose={() => setActivity(false)}
        items={allItems}
        collections={collections.status === 'ready' ? collections.value : []}
        version={version}
        connection={connection}
        phone={phone}
      />
      {/* On a phone Preferences sits in the panel, out of sight: the note stands on its own there. */}
      {phone ? <LanguageNote /> : null}
    </div>
  );
}
