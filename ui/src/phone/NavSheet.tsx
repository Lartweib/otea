import { type ReactNode, useEffect, useRef } from 'react';
import { useApp } from '../app/context.tsx';
import { boardCounts, stuckCount, tocaCount } from '../derive/toca.ts';
import { t } from '../i18n/i18n.ts';
import { Count } from '../kit/Count.tsx';
import { IC, Icon, type MockIconName } from '../kit/Icon.tsx';
import { Buddy } from '../kit/Marks.tsx';
import { type Route, studioHash, type ViewRoute } from '../selection.ts';
import { shellUi } from '../shell/shell-ui.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { navSheet, useNavSheet } from './nav.ts';

// The phone's nav sheet (SPEC §10.7, mock:3581-3616): the rail as a sheet from below. Te toca,
// Atasco, the boards with their open counts, Nuevo tablero, and Preferencias at its foot. The
// topbar's panel button (`.navbtn`) opens it.

// Where you are, as the sheet marks it: Te toca, Atasco or a board.
export function navOn(route: Route): string | null {
  switch (route.view) {
    case 'toca':
    case 'lan':
      return 'toca';
    case 'atasco':
      return 'atasco';
    case 'board':
      return `board:${route.board}`;
    default:
      return null;
  }
}

export function boardIcon(icon: string | null | undefined): MockIconName {
  return icon && icon in IC ? (icon as MockIconName) : 'board';
}

export type NavBodyProps = {
  route: Route;
  toca: number;
  atasco: number;
  boards: { name: string; icon: string | null; open: number }[];
  onGo: (to: ViewRoute) => void;
  onNewBoard: () => void;
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

export function NavBody({ route, toca, atasco, boards, onGo, onNewBoard, onPrefs }: NavBodyProps) {
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
        <Row
          i={i++}
          on={on === 'atasco'}
          icon={<Icon name="atasco" />}
          label={t('phone.atasco')}
          pair={<Count value={atasco} tone="warn" hold />}
          onPress={() => onGo({ view: 'atasco' })}
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
            icon={<Icon name={boardIcon(b.icon)} />}
            label={b.name}
            pair={<Count value={b.open} hold />}
            onPress={() => onGo({ view: 'board', board: b.name })}
          />
        ))}
        <Row
          i={i++}
          className="add"
          icon={<Icon name="plus" />}
          label={t('phone.newBoard')}
          onPress={onNewBoard}
        />
      </nav>
      <div className="foot">
        <nav className="nav">
          <Row i={i++} icon={<Buddy />} label={t('phone.prefs')} onPress={onPrefs} />
        </nav>
      </div>
    </>
  );
}

export function NavSheet() {
  const app = useApp();
  const open = useNavSheet();
  const after = useRef<(() => void) | null>(null);
  const phone = app.phone;
  const view = navOn(app.route) ?? app.route.view;

  // Off the phone there is no sheet to keep open.
  useEffect(() => {
    if (!phone) navSheet.close();
  }, [phone]);

  useEffect(() => {
    for (const b of document.querySelectorAll('.navbtn')) {
      b.setAttribute('aria-haspopup', 'dialog');
      b.setAttribute('aria-expanded', String(open));
    }
  }, [open]);

  // Going somewhere else (the back button, a link) puts it away.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes on a change of place
  useEffect(() => navSheet.close(), [view]);

  if (!phone) return null;
  const then = (fn: () => void) => {
    after.current = fn;
    navSheet.close();
  };
  return (
    <BottomSheet
      open={open}
      label={t('phone.nav')}
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
        atasco={stuckCount(app.all, { now: app.now })}
        boards={app.collections.map((c) => ({
          name: c.name,
          icon: c.icon,
          open: boardCounts(app.all, c.name).open,
        }))}
        onGo={(to) => {
          navSheet.close();
          app.go(to);
        }}
        onNewBoard={() =>
          then(() => {
            window.location.hash = studioHash({ kind: 'blueprint', diagram: false });
          })
        }
        // Preferences are the shell's: its button sits in the rail, which the phone hides. The
        // pop is pinned to the bottom on the phone (phone.css), wherever its anchor is.
        onPrefs={() => then(() => shellUi.set({ prefs: true }))}
      />
    </BottomSheet>
  );
}
