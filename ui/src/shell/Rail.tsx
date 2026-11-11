import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { useApp } from '../app/context.tsx';
import { useWorkspace, workspace } from '../app/workspace.ts';
import { boardCounts, stuckCount, tocaCount } from '../derive/toca.ts';
import { t } from '../i18n/i18n.ts';
import { IconButton } from '../kit/Button.tsx';
import { Count } from '../kit/Count.tsx';
import { Icon, type MockIconName } from '../kit/Icon.tsx';
import { Buddy, Chevron } from '../kit/Marks.tsx';
import { boardHash, hashOf, studioHash } from '../selection.ts';

// The rail (SPEC §7.2, mock:1420-1458). Foundation stub: Te toca, Atasco and the boards with their
// counts, the fold, and the Preferences button at the foot. The shell slice replaces it.

type RowProps = {
  on: boolean;
  icon: MockIconName;
  label: string;
  href: string;
  pair: ReactNode;
  badge: number;
  warn?: boolean;
  plus?: ReactNode;
};

function Row({ on, icon, label, href, pair, badge, warn = false, plus }: RowProps) {
  const go = () => {
    window.location.hash = href;
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row that holds its own + button
    <div
      className={on ? 'nrow on' : 'nrow'}
      role="button"
      tabIndex={0}
      data-tip={label}
      aria-current={on ? 'page' : undefined}
      onClick={go}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          go();
        }
      }}
    >
      <span className="ic">
        <Icon name={icon} />
      </span>
      <span className="lb">{label}</span>
      <span className="pair">{pair}</span>
      <i className={['badge', warn ? 'warn' : '', badge ? 'has' : ''].filter(Boolean).join(' ')}>
        {badge}
      </i>
      {plus}
    </div>
  );
}

export function Rail() {
  const app = useApp();
  const ws = useWorkspace();
  const navs = useRef<HTMLDivElement>(null);
  const r = app.route;
  const yours = tocaCount(app.all, { now: app.now });
  const stuck = stuckCount(app.all, { now: app.now });
  const fold = ws.folded ? t('nav.show') : t('nav.hide');

  // The selection pill sits under the row on screen.
  useLayoutEffect(() => {
    const box = navs.current;
    const sel = box?.querySelector<HTMLElement>('.rsel');
    const on = box?.querySelector<HTMLElement>('.nrow.on');
    if (!box || !sel) return;
    if (!on) {
      sel.style.opacity = '0';
      return;
    }
    sel.style.transform = `translateY(${on.getBoundingClientRect().top - box.getBoundingClientRect().top}px)`;
    sel.style.opacity = '1';
  });

  return (
    <aside className="rail" aria-label={t('nav.views')}>
      <div className="rhead">
        <IconButton
          aria-expanded={!ws.folded}
          aria-label={fold}
          data-tip={fold}
          onClick={() => workspace.set({ folded: !ws.folded })}
        >
          <Icon name="side" />
        </IconButton>
        <span className="lbl">{t('nav.views')}</span>
        <IconButton
          aria-label={t('nav.newItem')}
          data-tip={t('nav.newItem')}
          onClick={() => app.newItem()}
        >
          <Icon name="plus" />
        </IconButton>
      </div>
      <div className="navs" ref={navs} style={{ position: 'relative' }}>
        <i className="rsel" aria-hidden="true" />
        <nav className="nav">
          <Row
            on={r.view === 'toca'}
            icon="toca"
            label={t('nav.toca')}
            href={hashOf({ view: 'toca' })}
            pair={<Count value={yours} tone="you" hold />}
            badge={yours}
          />
          <Row
            on={r.view === 'atasco'}
            icon="atasco"
            label={t('nav.atasco')}
            href={hashOf({ view: 'atasco' })}
            pair={<Count value={stuck} tone="warn" hold />}
            badge={stuck}
            warn
          />
        </nav>
        <div className="rail-label">{t('nav.boards')}</div>
        <nav className="nav boards">
          {app.collections.map((c) => {
            const n = boardCounts(app.all, c.name);
            return (
              <Row
                key={c.name}
                on={r.view === 'board' && r.board === c.name}
                icon="board"
                label={c.name}
                href={boardHash(c.name)}
                pair={
                  <>
                    <Count value={n.yours} tone="you" hold /> / <Count value={n.open} hold />
                  </>
                }
                badge={n.yours}
                plus={
                  <button
                    type="button"
                    className="plus"
                    aria-label={t('nav.newItemIn', { board: c.name })}
                    data-tip={t('nav.newItemIn', { board: c.name })}
                    onClick={(e) => {
                      e.stopPropagation();
                      app.newItem({ board: c.name });
                    }}
                  >
                    <Icon name="plus" />
                  </button>
                }
              />
            );
          })}
          <button
            type="button"
            className="add"
            data-tip={t('nav.newBoard')}
            onClick={() => {
              window.location.hash = studioHash({ kind: 'blueprint', diagram: false });
            }}
          >
            <span className="ic">
              <Icon name="plus" />
            </span>
            <span className="lb">{t('nav.newBoard')}</span>
          </button>
        </nav>
      </div>
      <div className="rail-foot">
        <button
          type="button"
          className="prefs-btn"
          aria-expanded="false"
          aria-haspopup="dialog"
          data-tip={t('nav.prefs')}
        >
          <Buddy />
          <span className="lb">{t('nav.prefs')}</span>
          <Chevron up />
        </button>
      </div>
    </aside>
  );
}
