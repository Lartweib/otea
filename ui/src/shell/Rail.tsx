import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useApp } from '../app/context.tsx';
import { useWorkspace, workspace } from '../app/workspace.ts';
import { openNewBoard } from '../board-studio/home/studio-dialogs.ts';
import { stuckCount, tocaCount } from '../derive/toca.ts';
import { t } from '../i18n/i18n.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import { IconButton } from '../kit/Button.tsx';
import { Count } from '../kit/Count.tsx';
import { Icon } from '../kit/Icon.tsx';
import { C, F, lerp } from '../motion/curves.ts';
import { type Drive, drive } from '../motion/drive.ts';
import { reduced } from '../motion/reduced.ts';
import { studioHash, type ViewRoute } from '../selection.ts';
import { PrefsButton } from './Preferences.tsx';
import { type BoardIcon, boardEntries, foldClip, type RailKey, railKey } from './rail-model.ts';
import { useMedia } from './use-media.ts';

// The rail (SPEC §7.2, mock:159-198, 1420-1458, 4038-4069): the head (fold, vistas, + Nuevo ítem),
// Te toca and Atasco, the boards with yours / open, Nuevo tablero, the project's Studio and
// settings, one selection pill that slides to the row in view, and Preferences at the foot. It
// folds to a 60 px strip of icons: the rail clips, the labels fade, badges come up, and the main
// pane slides from where it was, so nothing reflows. Below 1024 px it is always folded.

const NARROW = '(max-width: 1023px)';

export function RowIcon({ icon }: { icon: BoardIcon }) {
  return icon.kind === 'mock' ? <Icon name={icon.name} /> : <TypeIcon name={icon.name} size={16} />;
}

type RowProps = {
  k: Exclude<RailKey, null>;
  on: boolean;
  icon: ReactNode;
  label: string;
  to: ViewRoute | string;
  pair?: ReactNode;
  badge?: { n: number; warn?: boolean };
  plus?: ReactNode;
};

function Row({ k, on, icon, label, to, pair, badge, plus }: RowProps) {
  const app = useApp();
  const go = () => {
    if (typeof to === 'string') window.location.hash = to;
    else app.go(to);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row that holds its own + button
    <div
      className={on ? 'nrow on' : 'nrow'}
      role="button"
      tabIndex={0}
      aria-current={on ? 'page' : undefined}
      data-k={k}
      data-tip={label}
      onClick={go}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          go();
        }
      }}
    >
      <span className="ic">{icon}</span>
      <span className="lb">{label}</span>
      {pair === undefined ? <span /> : <span className="pair">{pair}</span>}
      {badge ? (
        <i
          className={['badge', badge.warn ? 'warn' : '', badge.n ? 'has' : '']
            .filter(Boolean)
            .join(' ')}
        >
          {badge.n}
        </i>
      ) : null}
      {plus}
    </div>
  );
}

// The selection pill under the row in view (mock:1439-1449): it slides there, 360 settle, and
// follows the row if the rows move under it (the Studio tree folding) while it slides.
function useSelPill(navs: React.RefObject<HTMLDivElement | null>, key: RailKey) {
  const sliding = useRef<Drive | null>(null);
  const lastKey = useRef<RailKey | undefined>(undefined);
  const place = (animate: boolean) => {
    const box = navs.current;
    const sel = box?.querySelector<HTMLElement>(':scope > .rsel');
    const on = box?.querySelector<HTMLElement>('.nrow.on');
    if (!box || !sel) return;
    if (!on) {
      sel.style.opacity = '0';
      return;
    }
    // The row's top inside .navs (rows sit in a .nav, itself placed in .navs).
    const target = () => {
      const parent = on.offsetParent as HTMLElement | null;
      return on.offsetTop + (parent && parent !== box ? parent.offsetTop : 0);
    };
    const from = Number.parseFloat(sel.style.transform.replace('translateY(', '')) || 0;
    const shown = sel.style.opacity === '1';
    sel.style.opacity = '1';
    sliding.current?.cancel();
    sliding.current = null;
    if (!animate || !shown || reduced()) {
      sel.style.transform = `translateY(${target()}px)`;
      return;
    }
    sliding.current = drive(360, (k) => {
      sel.style.transform = `translateY(${lerp(from, target(), F.settle(k))}px)`;
      if (k >= 1) sliding.current = null;
    });
  };
  // A new row in view: the pill slides there. Any other commit: it keeps its place under the row,
  // unless it is on its way (its slide follows the row by itself).
  useLayoutEffect(() => {
    const moved = lastKey.current !== undefined && lastKey.current !== key;
    lastKey.current = key;
    if (moved || !sliding.current) place(moved);
  });
  useEffect(() => {
    const box = navs.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    // A row moved under the pill (the tree folding, a board added): it follows, unless it slides.
    const ro = new ResizeObserver(() => {
      if (!sliding.current) place(false);
    });
    for (const nav of box.querySelectorAll('.nav')) ro.observe(nav);
    return () => ro.disconnect();
  });
  useEffect(() => () => sliding.current?.cancel(), []);
}

export function Rail() {
  const app = useApp();
  const ws = useWorkspace();
  const narrow = useMedia(NARROW);
  const folded = ws.folded || narrow;
  const railRef = useRef<HTMLElement>(null);
  const navs = useRef<HTMLDivElement>(null);
  const key = railKey(app.route);
  const { canWrite, canConfigure } = app.session;
  const yours = tocaCount(app.all, { now: app.now });
  const stuck = stuckCount(app.all, { now: app.now });
  const boards = boardEntries(app.collections, app.all);
  const foldLabel = folded ? t('nav.show') : t('nav.hide');

  useSelPill(navs, key);

  // Below 1024 px the rail is always folded: the frame reads .app[data-folded], so it says so too.
  useLayoutEffect(() => {
    const appEl = railRef.current?.closest('.app');
    if (!appEl) return;
    if (narrow) appEl.setAttribute('data-folded', '');
    else if (!ws.folded) appEl.removeAttribute('data-folded');
  }, [narrow, ws.folded]);

  // The fold (mock:4039-4054): the main pane slides from its old left, the rail clips, both 560
  // settle; a second press mid-way turns them back from where they are.
  const toggleFold = () => {
    const rail = railRef.current;
    const main = rail?.closest('.app')?.querySelector<HTMLElement>(':scope > .main');
    if (!rail || !main) {
      workspace.set({ folded: !ws.folded });
      return;
    }
    const a = main.getBoundingClientRect().left;
    const clip = getComputedStyle(rail).clipPath;
    for (const x of [...rail.getAnimations(), ...main.getAnimations()]) {
      if (x.id === 'fold') x.cancel();
    }
    const next = !ws.folded;
    flushSync(() => workspace.set({ folded: next }));
    if (reduced()) return;
    const b = main.getBoundingClientRect().left;
    const opts = { duration: 560, easing: C.settle, id: 'fold' };
    if (a !== b)
      main.animate([{ transform: `translateX(${a - b}px)` }, { transform: 'none' }], opts);
    rail.animate(
      [
        { clipPath: clip && clip !== 'none' ? clip : foldClip(!next) },
        { clipPath: foldClip(next) },
      ],
      opts,
    );
  };

  const plus = (board: string) => (
    <button
      type="button"
      className="plus"
      aria-label={t('nav.newItemIn', { board })}
      data-tip={t('nav.newItemIn', { board })}
      onClick={(e) => {
        e.stopPropagation();
        app.newItem({ board });
      }}
    >
      <Icon name="plus" />
    </button>
  );

  return (
    <aside className="rail" ref={railRef} aria-label={t('nav.views')}>
      <div className="rhead">
        <IconButton
          aria-expanded={!folded}
          aria-label={foldLabel}
          {...(narrow ? {} : { 'data-tip': foldLabel })}
          disabled={narrow}
          onClick={toggleFold}
        >
          <Icon name="side" />
        </IconButton>
        <span className="lbl">{t('nav.views')}</span>
        {canWrite ? (
          <IconButton
            aria-label={t('nav.newItem')}
            data-tip={t('nav.newItem')}
            onClick={() => app.newItem()}
          >
            <Icon name="plus" />
          </IconButton>
        ) : null}
      </div>
      <div className="navs" ref={navs}>
        <i className="rsel" aria-hidden="true" />
        <nav className="nav">
          <Row
            k="toca"
            on={key === 'toca'}
            icon={<Icon name="toca" />}
            label={t('nav.toca')}
            to={{ view: 'toca' }}
            pair={<Count value={yours} tone="you" hold />}
            badge={{ n: yours }}
          />
          <Row
            k="atasco"
            on={key === 'atasco'}
            icon={<Icon name="atasco" />}
            label={t('nav.atasco')}
            to={{ view: 'atasco' }}
            pair={<Count value={stuck} tone="warn" hold />}
            badge={{ n: stuck, warn: true }}
          />
        </nav>
        <div className="rail-label">{t('nav.boards')}</div>
        <nav className="nav boards">
          {boards.map((b) => (
            <Row
              key={b.name}
              k={`board:${b.name}`}
              on={key === `board:${b.name}`}
              icon={
                <>
                  <RowIcon icon={b.icon} />
                  {b.letter ? <i className="ltr">{b.letter}</i> : null}
                </>
              }
              label={b.name}
              to={{ view: 'board', board: b.name }}
              pair={
                <>
                  <Count value={b.yours} tone="you" hold /> / <Count value={b.open} hold />
                </>
              }
              badge={{ n: b.yours }}
              plus={canWrite ? plus(b.name) : undefined}
            />
          ))}
          {canConfigure ? (
            <button
              type="button"
              className="add"
              data-tip={t('nav.newBoard')}
              onClick={() => openNewBoard()}
            >
              <span className="ic">
                <Icon name="plus" />
              </span>
              <span className="lb">{t('nav.newBoard')}</span>
            </button>
          ) : null}
        </nav>
        <div className="rail-label">{t('nav.project')}</div>
        <nav className="nav proj">
          <Row
            k="studio"
            on={key === 'studio'}
            icon={<TypeIcon name="ruler" size={16} />}
            label={t('nav.studio')}
            to={studioHash()}
          />
          {canConfigure ? (
            <Row
              k="settings"
              on={key === 'settings'}
              icon={<TypeIcon name="gear" size={16} />}
              label={t('nav.settings')}
              to={{ view: 'settings' }}
            />
          ) : null}
        </nav>
      </div>
      <div className="rail-foot">
        <PrefsButton />
      </div>
    </aside>
  );
}
