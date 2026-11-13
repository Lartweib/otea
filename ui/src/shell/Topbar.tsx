import { useState } from 'react';
import { useApp } from '../app/context.tsx';
import { tocaCount } from '../derive/toca.ts';
import { ageLabel } from '../format.ts';
import { t, tx } from '../i18n/i18n.ts';
import { iconDrawing, TypeIcon } from '../icons/TypeIcon.tsx';
import { Count } from '../kit/Count.tsx';
import { Icon } from '../kit/Icon.tsx';
import { AgentMark, Chevron, Tile } from '../kit/Marks.tsx';
import { MenuLabel } from '../kit/pop/Menu.tsx';
import { Pop } from '../kit/pop/Pop.tsx';
import { lookOf } from '../lanes/looks.ts';
import { NodeGlyph } from '../lanes/NodeGlyph.tsx';
import { monogramOf } from '../place-icons.ts';
import {
  type AgentRow,
  agentCounts,
  agentRows,
  elsewhereLine,
  type PillMark,
  type ProjectRow,
  pillMark,
  projectRows,
} from './topbar-model.ts';

// The topbar (SPEC §7.1, mock:127-157, 1393-1418, 3370-3393): 60 px, three zones on the dotted
// ground over a hairline. The project pill and the Elsewhere line; the living mark; the agents
// pill. Both pills open a Pop: the line leads from the pill's centre, the surface unrolls, the rows
// resolve, and it closes as the same gesture mirrored.

// The mark: "otea" whose o is a node. Its counter fills your blue while anything waits for you; its
// orbit draws in and turns while an agent holds a lease, clipped where "tea" begins.
export function Brand({ yours, working }: { yours: boolean; working: boolean }) {
  const cls = ['brand', yours ? 'yours' : '', working ? 'working' : ''].filter(Boolean).join(' ');
  return (
    <a className={cls} href="#/" aria-label={t('nav.home')}>
      <svg className="brand-o" viewBox="0 -703 584.44 823" aria-hidden="true">
        <defs>
          <clipPath id="brand-om">
            <rect x="-600" y="-1200" width="1164.44" height="1600" />
          </clipPath>
        </defs>
        <g clipPath="url(#brand-om)">
          <g className="brand-spin">
            <circle
              className="brand-orbit"
              cx="305.5"
              cy="-263.5"
              r="378"
              strokeWidth="60"
              pathLength={100}
              transform="rotate(-80 305.5 -263.5)"
            />
          </g>
        </g>
        <circle className="brand-fill" cx="305.5" cy="-263.5" r="209" />
        <circle className="brand-ring" cx="305.5" cy="-263.5" r="209" strokeWidth="128" />
      </svg>
      tea
    </a>
  );
}

// A project's tile: its icon when it has one, else its monogram.
function ProjectTile({
  name,
  icon,
  large = false,
}: {
  name: string;
  icon?: string | null | undefined;
  large?: boolean;
}) {
  return (
    <Tile large={large}>
      {icon && iconDrawing(icon) ? (
        <TypeIcon name={icon} size={large ? 16 : 12} />
      ) : (
        monogramOf(name)
      )}
    </Tile>
  );
}

type ProjectMenuProps = {
  project: string;
  rows: ProjectRow[];
  total: number;
  // Closes the menu (the project open now, and on the way anywhere).
  onClose: () => void;
};

// The project menu's rows (mock:3370-3380): Todos los proyectos, every project on this machine,
// the project's settings and how to start another.
export function ProjectMenuBody({ project, rows, total, onClose }: ProjectMenuProps) {
  const app = useApp();
  const away = (view: 'projects' | 'settings') => {
    onClose();
    app.go({ view });
  };
  const waits = (n: number) =>
    n > 0 ? (
      <span className="pw">
        <i className="dot" />
        {n}
      </span>
    ) : (
      <span />
    );
  return (
    <>
      <button type="button" className="prow" data-i="" onClick={() => away('projects')}>
        <span className="tile lg">
          <Icon name="inbox" />
        </span>
        <span>
          <span className="pn">{t('rail.projects')}</span>
          <span className="pl">{t('shell.allProjectsLine')}</span>
        </span>
        {waits(total)}
        <span />
      </button>
      <MenuLabel aside={<span>{rows.length}</span>}>{t('shell.projects')}</MenuLabel>
      {rows.map((row) => {
        const body = (
          <>
            <ProjectTile name={row.name} icon={row.current ? app.project?.icon : undefined} large />
            <span>
              <span className="pn">{row.name}</span>
              <span className="pl">{row.line}</span>
            </span>
            {waits(row.waiting)}
            {row.current ? (
              <span className="tick">
                <Icon name="check" />
              </span>
            ) : (
              <span />
            )}
          </>
        );
        if (row.current) {
          return (
            <button
              key={row.id}
              type="button"
              className="prow cur"
              data-i=""
              aria-current="page"
              onClick={onClose}
            >
              {body}
            </button>
          );
        }
        if (row.href) {
          return (
            <a
              key={row.id}
              className="prow"
              data-i=""
              href={row.href}
              target="_blank"
              rel="noopener"
              onClick={onClose}
            >
              {body}
            </a>
          );
        }
        return (
          <div key={row.id} className="prow inert" data-i="" aria-disabled="true">
            {body}
          </div>
        );
      })}
      <div className="pfoot" data-i="">
        {/* The project's settings are on the computer: the phone leaves them out. */}
        {app.phone ? null : (
          <button type="button" onClick={() => away('settings')}>
            {t('shell.settingsOf', { project })}
          </button>
        )}
        <span>{tx('shell.newProject', { command: <code>otea init</code> })}</span>
      </div>
    </>
  );
}

function ProjectPill() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null);
  const project = app.project;
  const name = project?.name ?? '';
  const menu = project
    ? projectRows(project, app.projects, tocaCount(app.all, { now: app.now }))
    : { rows: [], total: 0 };
  return (
    <>
      <button
        ref={setBtn}
        type="button"
        className="pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('shell.projectSwitch', { project: name })}
        onClick={() => setOpen((o) => !o)}
      >
        <ProjectTile name={name} icon={project?.icon} />
        <span className="nm">{name}</span>
        <Chevron />
      </button>
      <Pop
        open={open}
        anchor={btn}
        edge="top"
        place="below-left"
        role="dialog"
        label={t('shell.projectsTitle')}
        className="pmenu"
        onClose={() => setOpen(false)}
      >
        <ProjectMenuBody
          project={name}
          rows={menu.rows}
          total={menu.total}
          onClose={() => setOpen(false)}
        />
      </Pop>
    </>
  );
}

function Elsewhere() {
  const app = useApp();
  const line = elsewhereLine(app.projects);
  if (!line) return null;
  return (
    <a className="elsewhere" href="#/projects">
      <i className="dot" />
      {line}
    </a>
  );
}

// The pill's mark (mock:1395-1400): the working node with its orbit, a ring, a dashed ring; the
// dashed ring in warn while offline.
function AgentsMark({ kind }: { kind: PillMark }) {
  if (kind === 'working') {
    return (
      <svg className="am" viewBox="-12 -12 24 24" aria-hidden="true">
        <circle r="4.6" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
        <circle
          className="orb"
          r="8.6"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="14 54"
        />
      </svg>
    );
  }
  if (kind === 'idle') {
    return (
      <svg className="am" viewBox="-12 -12 24 24" aria-hidden="true">
        <circle r="5" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg className="am" viewBox="-12 -12 24 24" aria-hidden="true">
      <circle
        r="5.5"
        fill="none"
        stroke={kind === 'offline' ? 'var(--warn)' : 'var(--ink-3)'}
        strokeWidth="1.5"
        strokeDasharray="2.2 1.9"
      />
    </svg>
  );
}

type AgentsMenuProps = {
  project: string;
  rows: AgentRow[];
  counts: ReturnType<typeof agentCounts>;
  now: number;
  onOpen: (id: string) => void;
  onActivity: () => void;
  onConnect: () => void;
  onPerformance: () => void;
};

// The agents menu's rows (mock:3381-3393): who is connected, with its harness, what it holds (a
// mini node, the id, the title: it opens the item), or that it is idle, or quiet; when it last gave
// a sign. Then Ver actividad, Conectar un agente and Ver rendimiento, and what connected means.
export function AgentsMenuBody({
  project,
  rows,
  counts,
  now,
  onOpen,
  onActivity,
  onConnect,
  onPerformance,
}: AgentsMenuProps) {
  return (
    <>
      <MenuLabel
        aside={
          <span>
            {t('shell.holding', { count: counts.holding })} ·{' '}
            {t('shell.idleCount', { count: counts.idle })}
          </span>
        }
      >
        {t('shell.agentsIn', { project })}
      </MenuLabel>
      {rows.length === 0 ? (
        <p className="pnote" data-i="">
          {t('shell.noAgents')}
        </p>
      ) : null}
      {rows.map((a) => (
        <div key={a.name} className="arow" data-i="">
          <AgentMark name={a.name} decorative />
          <div className="ab">
            <div className="an">
              {a.name}
              {a.harness ? (
                <span className="htag">
                  {a.harness.toLowerCase() === 'cli' ? t('shell.cli') : a.harness}
                </span>
              ) : null}
            </div>
            {a.held.length === 0 ? <div className="idle">{t('shell.idle')}</div> : null}
            {a.held.map((h) => (
              <button key={h.id} type="button" className="held" onClick={() => onOpen(h.id)}>
                <NodeGlyph look={h.look} size={14} />
                <span className="id">{h.id}</span>
                <span className="tx">{h.title}</span>
              </button>
            ))}
            {a.quiet ? <div className="idle warn">{t('shell.quiet')}</div> : null}
          </div>
          <span className="seen">{ageLabel(a.lastSeen, now)}</span>
        </div>
      ))}
      <button type="button" className="mrow" data-i="" onClick={onActivity}>
        <span className="ic">
          <Icon name="act" />
        </span>
        <span>
          <b>{t('shell.activity')}</b>
          <small>{t('shell.activityLine')}</small>
        </span>
      </button>
      <button type="button" className="mrow" data-i="" onClick={onConnect}>
        <span className="ic">
          <Icon name="plus" />
        </span>
        <span>
          <b>{t('shell.connect')}</b>
          <small>{t('shell.connectLine')}</small>
        </span>
      </button>
      <button type="button" className="mrow" data-i="" onClick={onPerformance}>
        <span className="ic">
          <Icon name="perf" />
        </span>
        <span>
          <b>{t('shell.performance')}</b>
          <small>{t('shell.performanceLine')}</small>
        </span>
      </button>
      <p className="pnote afoot" data-i="">
        {t('shell.connectedRule')}
      </p>
    </>
  );
}

function AgentsPill() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null);
  if (app.agents === null) return null;
  const agents = app.agents ?? [];
  // One source for the pill and its menu: the menu's rows.
  const rows = agentRows(agents, app.all, app.now);
  const mark = pillMark(app.connection, rows);
  const offline = mark === 'offline';
  const counts = agentCounts(rows);
  const close = () => setOpen(false);
  return (
    <>
      <button
        ref={setBtn}
        type="button"
        className="apill"
        data-quiet={offline || counts.live === 0 || undefined}
        aria-haspopup={offline ? undefined : 'dialog'}
        aria-expanded={offline ? undefined : open}
        aria-label={t('shell.agentsTitle')}
        disabled={offline}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="amw">
          <AgentsMark kind={mark} />
        </span>
        {offline ? (
          <span>{t('shell.offline')}</span>
        ) : (
          <>
            <span>
              <Count value={counts.live} />
              <span className="wl"> {t('shell.agentsWord', { count: counts.live })}</span>
            </span>
            <small className="wl">
              <Count value={counts.holding} /> {t('shell.workingWord')}
            </small>
            <Chevron />
          </>
        )}
      </button>
      <Pop
        open={open && !offline}
        anchor={btn}
        edge="top"
        place="below-right"
        role="dialog"
        label={t('shell.agentsTitle')}
        className="amenu"
        onClose={close}
      >
        <AgentsMenuBody
          project={app.project?.name ?? ''}
          rows={rows}
          counts={counts}
          now={Date.now()}
          onOpen={(id) => {
            close();
            app.openItem(id);
          }}
          onActivity={() => {
            close();
            app.openActivity();
          }}
          onConnect={() => {
            close();
            app.openConnect();
          }}
          onPerformance={() => {
            close();
            app.go({ view: 'performance' });
          }}
        />
      </Pop>
    </>
  );
}

export function Topbar() {
  const app = useApp();
  const yours = tocaCount(app.all, { now: app.now }) > 0;
  const working = app.all.some((it) => lookOf(it, app.now) === 'working');
  return (
    <header className="topbar">
      <div className="tb-start">
        <ProjectPill />
        <Elsewhere />
      </div>
      <div className="tb-mid">
        <Brand yours={yours} working={working} />
      </div>
      <div className="tb-end">
        <AgentsPill />
      </div>
    </header>
  );
}
