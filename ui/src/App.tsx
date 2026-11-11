import { type ReactNode, useEffect } from 'react';
import { AppProvider, useApp } from './app/context.tsx';
import { ViewHost } from './app/ViewHost.tsx';
import { useWorkspace } from './app/workspace.ts';
import { applyAttention } from './attention-dom.ts';
import { catalogEntries } from './catalog.ts';
import { ActivityDrawer } from './components/ActivityDrawer.tsx';
import { BriefView } from './components/BriefView.tsx';
import { ConnectDialog } from './components/ConnectDialog.tsx';
import { LanguageNote } from './components/LanguageNote.tsx';
import { LanPanel } from './components/LanPanel.tsx';
import { CatalogOverview, ModuleIndex, ModulePanel } from './components/ModuleCatalog.tsx';
import { ProjectSettings } from './components/ProjectSettings.tsx';
import { ProjectsInbox } from './components/ProjectsInbox.tsx';
import { Triage } from './components/Triage.tsx';
import { AppliedToast } from './customize/AppliedToast.tsx';
import { CustomizePage } from './customize/CustomizePage.tsx';
import { useAttention, useRoute } from './hooks.ts';
import { t, useLanguage } from './i18n/i18n.ts';
import { Dialog } from './kit/pop/Dialog.tsx';
import { ToastHost } from './kit/pop/toast.tsx';
import { Tooltip } from './kit/Tooltip.tsx';
import { LaneDefs } from './lanes/LaneDefs.tsx';
import { MODULES } from './modules/registry.ts';
import { Fab } from './phone/Fab.tsx';
import { NavSheet } from './phone/NavSheet.tsx';
import type { Route } from './selection.ts';
import { Rail } from './shell/Rail.tsx';
import { Topbar } from './shell/Topbar.tsx';
import { Studio } from './studio/Studio.tsx';
import { useStudioIndex } from './studio/use-studio-index.ts';
import { BoardView } from './views/board/BoardView.tsx';
import { DetailHost } from './views/detail/DetailHost.tsx';
import { TocaView } from './views/toca/TocaView.tsx';

// The app (SPEC §11): AppProvider › the lanes' gradients, the toasts, the tooltip, then .app with
// the topbar, the rail and .main, where the view host shows the route's view, the detail sits
// beside it and the activity drawer slides over it. Customize keeps its own page.

// The view's identity: a new key is a new view (the old one leaves, the new one draws in).
export function viewKeyOf(route: Route): string {
  if (route.view === 'board') return `board:${route.board}`;
  if (route.view === 'lan') return 'toca';
  return route.view;
}

function Catalog({ name }: { name: string | undefined }) {
  const app = useApp();
  const presets = app.presetsRemote;
  const entries = catalogEntries(MODULES, app.presets);
  const entry = entries.find((candidate) => candidate.name === name);
  return (
    <main className="layout catalog">
      <div className="list-pane">
        <ModuleIndex entries={entries} selected={name} />
      </div>
      <div className="detail-pane">
        <div className="detail-panel raised">
          {name === undefined ? (
            <CatalogOverview presets={presets} />
          ) : entry ? (
            <ModulePanel key={entry.name} entry={entry} presets={presets} />
          ) : (
            <p className="pane-message t-small">{t('app.noModule', { name })}</p>
          )}
        </div>
      </div>
    </main>
  );
}

function View({ route }: { route: Route }): ReactNode {
  const app = useApp();
  const inStudio = route.view === 'studio' || route.view === 'modules';
  const index = useStudioIndex(inStudio, app.version + app.studioWrites, app.connection);
  switch (route.view) {
    case 'toca':
    case 'lan':
      return <TocaView />;
    case 'atasco':
      return <TocaView atasco />;
    case 'board':
      return <BoardView board={route.board} />;
    case 'triage':
      return app.session.canWrite ? <Triage /> : <TocaView />;
    case 'projects':
      return <ProjectsInbox />;
    case 'settings':
      return (
        <ProjectSettings
          version={app.version}
          connection={app.connection}
          canWrite={app.session.canConfigure}
        />
      );
    case 'studio':
      return (
        <Studio
          page={route.page}
          connection={app.connection}
          version={app.version}
          canWrite={app.session.canConfigure}
          phone={app.phone}
          items={app.all}
          rail={null}
          sidebar={false}
          onChanged={app.studioChanged}
          index={index}
        />
      );
    case 'modules':
      return <Catalog name={route.name} />;
    case 'brief':
      return <BriefView ids={route.ids} items={app.all} version={app.version} />;
    case 'customize':
      return null;
  }
}

function Shell() {
  const app = useApp();
  const ws = useWorkspace();
  const { yours, working } = useAttention(app.all);
  useEffect(() => applyAttention({ yours, working }), [yours, working]);
  const route = app.route;
  if (route.view === 'customize') {
    // A template saved from here lands on this page again: the note shows on the page you land on.
    return (
      <>
        <CustomizePage
          target={route.target}
          items={app.all}
          version={app.version}
          connection={app.connection}
          onApplied={app.studioChanged}
        />
        <AppliedToast onUndone={app.studioChanged} />
      </>
    );
  }
  return (
    <>
      <LaneDefs />
      <div className="app" data-folded={ws.folded ? '' : undefined}>
        <AppliedToast onUndone={app.studioChanged} />
        <Topbar />
        <Rail />
        <main className="main">
          <ViewHost viewKey={viewKeyOf(route)} kind={route.view === 'lan' ? 'toca' : route.view}>
            <View route={route} />
          </ViewHost>
          <DetailHost />
          <ActivityDrawer open={ws.activity} onClose={app.closeActivity} />
          <div className="fxl" />
        </main>
      </div>
      <Dialog
        open={route.view === 'lan'}
        label={t('lan.title')}
        onClose={() => app.go({ view: 'toca' })}
      >
        <LanPanel canManage={app.session.canManageDevices} />
      </Dialog>
      <ConnectDialog />
      <NavSheet />
      <Fab />
      <LanguageNote />
      <ToastHost />
      <Tooltip />
      <div id="layer" className="layer" />
    </>
  );
}

export function App() {
  // Every word on screen follows the language: a switch renders the whole app again.
  useLanguage();
  useRoute();
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
