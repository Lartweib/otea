import { useApp } from '../app/context.tsx';
import { tocaCount } from '../derive/toca.ts';
import { t } from '../i18n/i18n.ts';
import { Chevron, Tile } from '../kit/Marks.tsx';

// The topbar (SPEC §7.1, mock:1393-1418). Foundation stub: the project pill, the mark, the agents
// pill into Actividad. The shell slice replaces it.

const MARK =
  '<svg class="brand-o" viewBox="0 -703 584.44 823" aria-hidden="true"><defs><clipPath id="om"><rect x="-600" y="-1200" width="1164.44" height="1600"/></clipPath></defs><g clip-path="url(#om)"><g class="brand-spin"><circle class="brand-orbit" cx="305.5" cy="-263.5" r="378" stroke-width="60" pathLength="100" transform="rotate(-80 305.5 -263.5)"/></g></g><circle class="brand-fill" cx="305.5" cy="-263.5" r="209"/><circle class="brand-ring" cx="305.5" cy="-263.5" r="209" stroke-width="128"/></svg>';

const WORKING =
  '<svg class="am" viewBox="-12 -12 24 24"><circle r="4.6" fill="none" stroke="var(--ink)" stroke-width="1.6"/><circle class="orb" r="8.6" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="14 54"/></svg>';
const IDLE =
  '<svg class="am" viewBox="-12 -12 24 24"><circle r="5" fill="none" stroke="var(--ink-2)" stroke-width="1.6"/></svg>';
const NONE =
  '<svg class="am" viewBox="-12 -12 24 24"><circle r="5.5" fill="none" stroke="var(--ink-3)" stroke-width="1.5" stroke-dasharray="2.2 1.9"/></svg>';

export const monogram = (name: string): string =>
  (name.slice(0, 1).toUpperCase() + name.slice(1, 2).toLowerCase()).trim();

export function Topbar() {
  const app = useApp();
  const name = app.project?.name ?? '';
  const agents = app.agents ?? [];
  const working = agents.filter((a) => a.holding.length > 0).length;
  const yours = tocaCount(app.all, { now: app.now }) > 0;
  const brand = ['brand', yours ? 'yours' : '', working ? 'working' : ''].filter(Boolean).join(' ');
  return (
    <header className="topbar">
      <div className="tb-start">
        <button
          type="button"
          className="pill"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-label={t('shell.projectSwitch', { project: name })}
        >
          <Tile>{monogram(name)}</Tile>
          <span className="nm">{name}</span>
          <Chevron />
        </button>
      </div>
      <div className="tb-mid">
        <a className={brand} href="#/" aria-label={t('nav.home')}>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the fixed mark */}
          <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: MARK }} />
          tea
        </a>
      </div>
      <div className="tb-end">
        <button
          type="button"
          className="apill"
          aria-haspopup="dialog"
          aria-expanded="false"
          disabled={app.connection !== 'live'}
          onClick={app.openActivity}
        >
          <span
            className="amw"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: the fixed marks above
            dangerouslySetInnerHTML={{ __html: working ? WORKING : agents.length ? IDLE : NONE }}
          />
          <span>{t('shell.agents', { count: agents.length })}</span>
          <small className="wl">{t('nav.working', { count: working })}</small>
          <Chevron />
        </button>
      </div>
    </header>
  );
}
