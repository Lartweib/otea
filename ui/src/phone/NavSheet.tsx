import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { tocaCount } from '../derive/toca.ts';
import { t } from '../i18n/i18n.ts';
import { Count } from '../kit/Count.tsx';
import { Icon } from '../kit/Icon.tsx';
import { Buddy } from '../kit/Marks.tsx';
import type { Route, ViewRoute } from '../selection.ts';
import { RowIcon } from '../shell/Rail.tsx';
import { type BoardEntry, boardEntries } from '../shell/rail-model.ts';
import { shellUi } from '../shell/shell-ui.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { navSheet, useNavSheet } from './nav.ts';

// The phone's Panel (mobile mock 5): the rail as a sheet from below. Te toca, the boards (read on
// the phone) with yours / open, Preferencias at its foot, and a line saying Studio and Settings
// are on the computer, where a button that fails would be. The bottom bar's Panel opens it, and it
// rises out of that tab. A row closes it at once (the way there does not wait for it); the scrim
// or a flick takes it down the way it came.

// Where you are, as the sheet marks it: Te toca (Atasco is one of its sections) or a board.
export function navOn(route: Route): string | null {
  switch (route.view) {
    case 'toca':
    case 'lan':
    case 'atasco':
      return 'toca';
    case 'board':
      return `board:${route.board}`;
    default:
      return null;
  }
}

export type NavBodyProps = {
  route: Route;
  toca: number;
  boards: BoardEntry[];
  onGo: (to: ViewRoute) => void;
  onPrefs: () => void;
};

type RowProps = {
  i: number;
  on?: boolean;
  icon: ReactNode;
  label: string;
  pair?: ReactNode;
  className?: string;
  onPress: () => void;
};

function Row({ i, on = false, icon, label, pair, className, onPress }: RowProps) {
  return (
    <button
      type="button"
      className={['nrow', on ? 'on' : '', className].filter(Boolean).join(' ')}
      data-i={i}
      aria-current={on ? 'page' : undefined}
      onClick={onPress}
    >
      <span className="ic">{icon}</span>
      <span className="lb">{label}</span>
      {pair === undefined ? null : <span className="pair">{pair}</span>}
    </button>
  );
}

export function NavBody({ route, toca, boards, onGo, onPrefs }: NavBodyProps) {
  const on = navOn(route);
  let i = 0;
  return (
    <>
      <nav className="nav">
        <Row
          i={i++}
          on={on === 'toca'}
          icon={<Icon name="toca" />}
          label={t('phone.toca')}
          pair={<Count value={toca} tone="you" hold />}
          onPress={() => onGo({ view: 'toca' })}
        />
      </nav>
      <div className="rail-label" data-i={i++}>
        {t('phone.boards')}
      </div>
      <nav className="nav">
        {boards.map((b) => (
          <Row
            key={b.name}
            i={i++}
            on={on === `board:${b.name}`}
            icon={
              <>
                <RowIcon icon={b.icon} />
                {b.letter ? <i className="ltr">{b.letter}</i> : null}
              </>
            }
            label={b.name}
            pair={
              <>
                <Count value={b.yours} tone="you" hold /> / <Count value={b.open} hold />
              </>
            }
            onPress={() => onGo({ view: 'board', board: b.name })}
          />
        ))}
      </nav>
      <div className="foot">
        <nav className="nav">
          <Row i={i++} icon={<Buddy />} label={t('phone.prefs')} onPress={onPrefs} />
        </nav>
        <p className="desk" data-i={i++}>
          <Icon name="sys" />
          <span>{t('phone.desk')}</span>
        </p>
      </div>
    </>
  );
}

export function NavSheet() {
  const app = useApp();
  const open = useNavSheet();
  const after = useRef<(() => void) | null>(null);
  // A row takes it away at once; the scrim, Escape or a flick take it down the way it came.
  const [now, setNow] = useState(false);
  const phone = app.phone;
  const view = navOn(app.route) ?? app.route.view;

  // Off the phone there is no sheet to keep open.
  useEffect(() => {
    if (!phone) navSheet.close();
  }, [phone]);

  // Going somewhere else (the back button, a link) puts it away.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes on a change of place
  useEffect(() => navSheet.close(), [view]);

  if (open && now) setNow(false);
  if (!phone) return null;
  const closeNow = (then?: () => void) => {
    after.current = then ?? null;
    setNow(true);
    navSheet.close();
  };
  return (
    <BottomSheet
      open={open}
      instant={now}
      label={t('phone.nav')}
      from={() => document.querySelector('.tabbar [data-tab="panel"]')}
      onClose={navSheet.close}
      onClosed={() => {
        const fn = after.current;
        after.current = null;
        fn?.();
      }}
    >
      <NavBody
        route={app.route}
        toca={tocaCount(app.all, { now: app.now })}
        boards={boardEntries(app.collections, app.all)}
        onGo={(to) => {
          closeNow();
          app.go(to);
        }}
        // Preferences are the shell's: its button sits in the rail, which the phone hides. The
        // pop is pinned to the bottom on the phone (phone.css); it opens once the panel is gone.
        onPrefs={() => closeNow(() => shellUi.set({ prefs: true }))}
      />
    </BottomSheet>
  );
}
