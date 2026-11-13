import type { Ref } from 'react';
import { useApp } from '../app/context.tsx';
import { useWorkspace, type Workspace } from '../app/workspace.ts';
import { tocaCount } from '../derive/toca.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/Icon.tsx';
import type { Route } from '../selection.ts';
import { openCapture } from './capture.ts';
import { navSheet, useNavSheet } from './nav.ts';
import { useRise } from './rise.ts';

// The phone's bottom bar (mobile mock 1, 4): Te toca with what waits for you, Nuevo (the one way to
// create on the phone) and Panel, which opens the nav sheet. It is solid and every page ends above
// it, so nothing floats over content. It stands on every page of the project and goes while an
// item, the new item page or the activity drawer takes the screen.

export type Tab = 'toca' | 'panel';

export function tabBarFor(route: Route, ws: Pick<Workspace, 'intake' | 'activity'>): boolean {
  return !(route.item || ws.intake || ws.activity);
}

// The tab lit for where you are: your lists under Te toca, a board under Panel (it is where the
// boards are).
export function tabOn(route: Route): Tab | null {
  switch (route.view) {
    case 'toca':
    case 'lan':
    case 'atasco':
    case 'triage':
      return 'toca';
    case 'board':
      return 'panel';
    default:
      return null;
  }
}

// What Nuevo opens the quick capture on: the board in view, else the capture's own pick.
export function captureTarget(route: Route): { board?: string } {
  return route.view === 'board' ? { board: route.board } : {};
}

export type TabBarViewProps = {
  on: Tab | null;
  toca: number;
  panelOpen: boolean;
  canCreate: boolean;
  onToca: () => void;
  onNew: () => void;
  onPanel: () => void;
  ref?: Ref<HTMLElement>;
};

export function TabBarView(p: TabBarViewProps) {
  const cls = (tab: Tab) => (p.on === tab ? 'tab on' : 'tab');
  const current = (tab: Tab) => (p.on === tab ? ('page' as const) : undefined);
  return (
    <nav className="tabbar" aria-label={t('phone.tabs')} ref={p.ref}>
      <button
        type="button"
        className={cls('toca')}
        data-tab="toca"
        aria-current={current('toca')}
        onClick={p.onToca}
      >
        <Icon name="toca" />
        {p.toca > 0 ? <span className="tbadge">{p.toca}</span> : null}
        <span className="lb">{t('phone.toca')}</span>
      </button>
      <button
        type="button"
        className="tab plus"
        data-tab="new"
        disabled={!p.canCreate}
        onClick={p.onNew}
      >
        <span className="disc">
          <Icon name="plus" />
        </span>
        <span className="lb">{t('phone.new')}</span>
      </button>
      <button
        type="button"
        className={cls('panel')}
        data-tab="panel"
        aria-current={current('panel')}
        aria-haspopup="dialog"
        aria-expanded={p.panelOpen}
        onClick={p.onPanel}
      >
        <Icon name="panel" />
        <span className="lb">{t('phone.nav')}</span>
      </button>
    </nav>
  );
}

export function TabBar() {
  const app = useApp();
  const ws = useWorkspace();
  const open = useNavSheet();
  // It rises in with the page that has it and sinks away, mirrored, when an item takes the screen.
  const { mounted, ref } = useRise<HTMLElement>(app.phone && tabBarFor(app.route, ws));
  if (!mounted) return null;
  return (
    <TabBarView
      ref={ref}
      on={tabOn(app.route)}
      toca={tocaCount(app.all, { now: app.now })}
      panelOpen={open}
      // Offline too, where the app keeps a queue: the capture waits for the PC.
      canCreate={app.canCapture}
      onToca={() => {
        navSheet.close();
        app.go({ view: 'toca' });
      }}
      // The quick capture grows out of Nuevo's round.
      onNew={() =>
        openCapture({
          ...captureTarget(app.route),
          from: () => document.querySelector('.tabbar [data-tab="new"] .disc'),
        })
      }
      onPanel={navSheet.toggle}
    />
  );
}
