import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { type Attention, attentionFrame } from '../attention.ts';
import { ageLabel } from '../format.ts';
import type { Connection } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import { AgentMark, Icon, NodeMark } from '../kit/index.ts';
import { itemNodeKind, type NodeKind } from '../node-kind.ts';
import { type Agent, liveAgents, type PillState } from '../presence.ts';
import { projectHref, waitingElsewhere, whereOf } from '../projects.ts';
import { hashFor, ITEMS_HASH, PROJECTS_HASH, SETTINGS_HASH } from '../selection.ts';
import type { CollectionView, Item, ProjectOverview, ProjectView } from '../types.ts';
import { type Menu, useMenu } from './menu.ts';
import { PlaceIcon } from './PlaceIcon.tsx';
import { Sheet } from './Sheet.tsx';

// The wordmark: its o is the node, drawn in 1/1000 em of Schibsted Grotesk 700 on the o's own
// advance, so "tea" stays live text and starts where it would. A true circle on the o's centre
// (305.5, −263.5): outer radius 273, a ring at the letters' weight (128) around a counter of 145
// that holds your color while something is yours. The orbit runs outside the o while an agent
// works, masked from where the t begins so it passes behind the word.
export function Brand({ attention, id = 'brand' }: { attention: Attention; id?: string }) {
  return (
    <a
      className="brand"
      href={ITEMS_HASH}
      aria-label={t('app.brand')}
      data-attention={attentionFrame(attention)}
    >
      <span className="brand-word">
        <svg className="brand-o" viewBox="0 -703 584.44 823" aria-hidden="true">
          <mask
            id={`${id}-orbit-mask`}
            maskUnits="userSpaceOnUse"
            x="-600"
            y="-1200"
            width="1800"
            height="1600"
          >
            <rect x="-600" y="-1200" width="1800" height="1600" fill="#fff" />
            <rect x="564.44" y="-1200" width="900" height="1600" fill="#000" />
          </mask>
          <g mask={`url(#${id}-orbit-mask)`}>
            <circle
              className="brand-orbit"
              cx="305.5"
              cy="-263.5"
              r="378"
              strokeWidth="60"
              pathLength={100}
            />
          </g>
          <circle className="brand-fill" cx="305.5" cy="-263.5" r="209" />
          <circle className="brand-ring" cx="305.5" cy="-263.5" r="209" strokeWidth="128" />
        </svg>
        tea
      </span>
    </a>
  );
}

function Chevron() {
  return (
    <svg className="menu-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.25 4.75 L6 7.5 L8.75 4.75" />
    </svg>
  );
}

function Tick() {
  return (
    <svg className="menu-tick" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.4 L6.6 11.4 L12.5 5" />
    </svg>
  );
}

// A menu's surface. It opens out of its pill: a strip as wide as the pill, which widens to the menu's
// width and then drops, its rows coming in one by one (see shell.css). --from is the pill's width.
function MenuSurface({
  menu,
  from,
  side,
  label,
  children,
}: {
  menu: Menu;
  from: number;
  side: 'start' | 'end';
  label: string;
  children: ReactNode;
}) {
  if (menu.phase === 'closed') return null;
  return (
    <div
      className="menu raised"
      role="dialog"
      aria-label={label}
      data-side={side}
      data-phase={menu.phase}
      style={{ '--from': `${from}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}

// The width of the pill a menu grows out of.
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setWidth(element.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// ---- the project pill ----

// What waits for you in a project, as the filled node of your lane and its count; nothing at zero.
function Waiting({ count }: { count: number }) {
  if (count === 0) return <span />;
  return (
    <span className="menu-waiting" title={t('rail.waiting')}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4" />
      </svg>
      {count}
    </span>
  );
}

// Every project on this machine (GET /api/projects): All projects first, then each project with
// where it lives and what waits for you there. The one served here carries the tick; another opens
// in the server that shows it, or names the command that would.
function ProjectRows({
  project,
  projects,
}: {
  project: ProjectView;
  projects: readonly ProjectOverview[] | undefined;
}) {
  const listed: ProjectOverview[] = projects?.length
    ? [...projects]
    : [
        {
          id: project.id,
          name: project.name,
          storage: 'common',
          current: true,
          paths: [],
          waiting: [],
          withAgents: 0,
          open: 0,
        },
      ];
  const total = listed.reduce((sum, each) => sum + each.waiting.length, 0);
  return (
    <>
      <a
        className="menu-row project-row"
        href={PROJECTS_HASH}
        style={{ '--i': 0 } as CSSProperties}
      >
        <span className="project-tile" data-all="true">
          <PlaceIcon icon="inbox" name={t('rail.projects')} size={16} />
        </span>
        <span className="menu-text">
          <span className="menu-name">{t('rail.projects')}</span>
          <span className="menu-line">{t('shell.allProjectsLine')}</span>
        </span>
        <Waiting count={total} />
      </a>
      <div className="menu-head">
        <span className="t-label">{t('shell.projects')}</span>
        <span className="t-cap">{listed.length}</span>
      </div>
      {listed.map((each, index) => {
        const href = each.current ? ITEMS_HASH : projectHref(each);
        const icon = each.current ? (project.icon ?? undefined) : undefined;
        const where = whereOf(each);
        const missing = each.paths.some((path) => path.missing);
        const line = each.current
          ? t('shell.projectOpen')
          : href
            ? (where ?? '')
            : t('shell.notServed');
        const body = (
          <>
            <span className="project-tile">
              <PlaceIcon icon={icon} name={each.name} size={16} />
            </span>
            <span className="menu-text">
              <span className="menu-name">{each.name}</span>
              <span className="menu-line">
                {missing ? `${t('shell.pathMissing')} · ` : ''}
                {line}
              </span>
            </span>
            <span className="menu-end">
              <Waiting count={each.waiting.length} />
              {each.current ? <Tick /> : null}
            </span>
          </>
        );
        const style = { '--i': index + 1 } as CSSProperties;
        return href ? (
          <a
            key={each.id}
            className="menu-row project-row"
            href={href}
            aria-current={each.current ? 'page' : undefined}
            style={style}
          >
            {body}
          </a>
        ) : (
          <span key={each.id} className="menu-row project-row" data-off="true" style={style}>
            {body}
          </span>
        );
      })}
      <div className="menu-foot" style={{ '--i': listed.length + 1 } as CSSProperties}>
        <a className="menu-link" href={SETTINGS_HASH}>
          {t('shell.settingsOf', { project: project.name })}
        </a>
        <span className="t-cap">{tx('shell.newProject', { command: <code>otea init</code> })}</span>
      </div>
    </>
  );
}

// The rest of your attention, outside the project you are in: a quiet line that opens the inbox
// of every project. Gone while nothing waits elsewhere.
function Elsewhere({ projects }: { projects: readonly ProjectOverview[] | undefined }) {
  const { count, projects: where } = waitingElsewhere(projects ?? []);
  if (count === 0) return null;
  return (
    <a className="topbar-elsewhere" href={PROJECTS_HASH}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4" />
      </svg>
      <span>
        {t('shell.elsewhere', { count, where: t('shell.otherProjects', { count: where }) })}
      </span>
    </a>
  );
}

// The project you are in, at the head of the column that lists its collections. It opens the
// projects this browser can reach.
function ProjectPill({
  project,
  projects,
  folded,
  phone,
}: {
  project: ProjectView | undefined;
  projects: readonly ProjectOverview[] | undefined;
  folded: boolean;
  phone: boolean;
}) {
  const menu = useMenu();
  const [pill, width] = useWidth<HTMLButtonElement>();
  if (!project) return <span className="project-pill-room" />;
  const rows = <ProjectRows project={project} projects={projects} />;
  return (
    <span className="pill-anchor" ref={menu.ref}>
      <button
        ref={pill}
        type="button"
        className="project-pill"
        data-folded={folded || undefined}
        aria-expanded={menu.open}
        aria-haspopup="dialog"
        aria-label={t('shell.projectSwitch', { project: project.name })}
        onClick={menu.toggle}
      >
        <PlaceIcon icon={project.icon ?? undefined} name={project.name} size={16} />
        <span className="project-name">{project.name}</span>
        <Chevron />
      </button>
      {phone ? (
        <Sheet menu={menu} label={t('shell.projectsTitle')} title={t('shell.projectsTitle')}>
          {rows}
        </Sheet>
      ) : (
        <MenuSurface menu={menu} from={width} side="start" label={t('shell.projectsTitle')}>
          {rows}
        </MenuSurface>
      )}
    </span>
  );
}

// ---- the agents pill ----

function NodeGlyph({ kind, size = 14 }: { kind: NodeKind; size?: number }) {
  const half = size / 2;
  return (
    <svg
      className="agent-node"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <NodeMark kind={kind} cx={half} cy={half} r={size * 0.25} />
    </svg>
  );
}

// The pill's mark: the agent node, with the list's orbit while any agent holds a lease; a dotted
// ring when nobody is connected, in warning ink when the stream is down.
function PillMark({ state }: { state: PillState }) {
  if (state.kind === 'agents' && state.count > 0) {
    return <NodeGlyph kind={state.holding > 0 ? 'working' : 'queued'} size={16} />;
  }
  return (
    <svg className="agent-node" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle
        className={state.kind === 'offline' ? 'pill-ring off' : 'pill-ring'}
        cx="8"
        cy="8"
        r="4.25"
      />
    </svg>
  );
}

function pillText(state: PillState, connection: Connection, compact: boolean): string {
  if (state.kind === 'offline') {
    return t(connection === 'connecting' ? 'connection.connecting' : 'shell.offline');
  }
  if (state.kind !== 'agents') return '';
  if (compact && state.count > 0) return String(state.count);
  return state.count === 0 ? t('shell.noAgents') : t('shell.agents', { count: state.count });
}

type Lookup = {
  items: readonly Item[];
  collectionOf: (name: string) => CollectionView | undefined;
};

function Held({ id, lookup, onOpen }: { id: string; lookup: Lookup; onOpen: () => void }) {
  const item = lookup.items.find((each) => each.id === id);
  const type = item
    ? lookup.collectionOf(item.collection)?.types.find((each) => each.name === item.type)
    : undefined;
  return (
    <a className="agent-held" href={hashFor(id)} onClick={onOpen}>
      <NodeGlyph kind={item ? itemNodeKind(item, type, item.lease !== null) : 'working'} />
      <span className="agent-held-id">{id}</span>
      {item ? <span className="agent-held-title">{item.title}</span> : null}
    </a>
  );
}

function AgentRow({
  agent,
  lookup,
  onOpen,
  index,
}: {
  agent: Agent;
  lookup: Lookup;
  onOpen: () => void;
  index: number;
}) {
  return (
    <div className="agent-row" style={{ '--i': index } as CSSProperties}>
      <AgentMark name={agent.name} decorative />
      <span className="agent-body">
        <span className="agent-line">
          <span className="agent-name">{agent.name}</span>
          {agent.harness === null ? null : agent.harness.toLowerCase() === 'cli' ? (
            <span className="agent-harness cli">{t('shell.cli')}</span>
          ) : (
            <span className="agent-harness">{agent.harness}</span>
          )}
        </span>
        {agent.holding.length > 0 ? (
          agent.holding.map((id) => <Held key={id} id={id} lookup={lookup} onOpen={onOpen} />)
        ) : (
          <span className="agent-idle">{t('shell.idle')}</span>
        )}
      </span>
      <span className="t-cap agent-seen">{ageLabel(agent.lastSeen, Date.now())}</span>
    </div>
  );
}

function AgentList({
  agents,
  project,
  lookup,
  onOpen,
  onActivity,
}: {
  agents: Agent[];
  project: string;
  lookup: Lookup;
  onOpen: () => void;
  // Opens the activity drawer: each lease draining and the feed of what agents did.
  onActivity?: (() => void) | undefined;
}) {
  const live = liveAgents(agents);
  const holding = live.filter((agent) => agent.holding.length > 0).length;
  return (
    <>
      <div className="menu-head">
        <span className="t-label">{t('shell.agentsIn', { project })}</span>
        <span className="t-cap">{live.length}</span>
        {live.length > 0 ? (
          <span className="menu-sum">
            {t('shell.holding', { count: holding })}
            <span aria-hidden="true">·</span>
            {t('shell.idleCount', { count: live.length - holding })}
          </span>
        ) : null}
      </div>
      {live.length > 0 ? (
        live.map((agent, index) => (
          <AgentRow
            key={agent.name}
            agent={agent}
            lookup={lookup}
            onOpen={onOpen}
            index={index + 1}
          />
        ))
      ) : (
        <div className="agents-empty" style={{ '--i': 1 } as CSSProperties}>
          <p className="agents-empty-head">{t('shell.noAgentsTitle')}</p>
          <p className="t-small">
            {tx('shell.howToConnect', {
              mcp: <code>otea mcp</code>,
              otea: <code>otea</code>,
              as: <code>--as &lt;name&gt;</code>,
            })}
          </p>
        </div>
      )}
      {onActivity ? (
        <button
          type="button"
          className="menu-row activity-row"
          style={{ '--i': live.length + 1 } as CSSProperties}
          onClick={() => {
            onOpen();
            onActivity();
          }}
        >
          <Icon name="activity" />
          <span className="menu-text">
            <span className="menu-name">{t('activity.open')}</span>
            <span className="menu-line">{t('activity.openLine')}</span>
          </span>
        </button>
      ) : null}
      <div className="menu-foot" style={{ '--i': live.length + 2 } as CSSProperties}>
        <span className="t-cap">{t('shell.connectedRule')}</span>
      </div>
    </>
  );
}

function LivePill({
  state,
  connection,
  agents,
  project,
  lookup,
  phone,
  onActivity,
}: {
  state: PillState;
  connection: Connection;
  agents: Agent[];
  project: string;
  lookup: Lookup;
  phone: boolean;
  onActivity?: (() => void) | undefined;
}) {
  const menu = useMenu();
  const [pill, width] = useWidth<HTMLButtonElement>();
  if (state.kind === 'absent') return null;
  const quiet = state.kind === 'offline' || state.count === 0;
  const text = pillText(state, connection, phone);
  // While the stream is down the pill only says so: it cannot count, so it opens nothing.
  const opens = state.kind === 'agents';
  const list = (
    <AgentList
      agents={agents}
      project={project}
      lookup={lookup}
      onOpen={menu.close}
      onActivity={onActivity}
    />
  );
  return (
    <span className="pill-anchor" ref={menu.ref}>
      <button
        ref={pill}
        type="button"
        className="live-pill"
        data-quiet={quiet || undefined}
        data-connection={connection}
        aria-expanded={opens ? menu.open : undefined}
        aria-haspopup={opens ? 'dialog' : undefined}
        aria-label={phone ? `${t('shell.agentsTitle')}: ${text}` : undefined}
        disabled={!opens}
        onClick={menu.toggle}
      >
        <PillMark state={state} />
        <span className="live-text">{text}</span>
        {opens && !phone ? <Chevron /> : null}
      </button>
      {!opens ? null : phone ? (
        <Sheet menu={menu} label={t('shell.agentsTitle')} title={t('shell.agentsTitle')}>
          {list}
        </Sheet>
      ) : (
        <MenuSurface menu={menu} from={width} side="end" label={t('shell.agentsTitle')}>
          {list}
        </MenuSurface>
      )}
    </span>
  );
}

type TopbarProps = {
  attention: Attention;
  project: ProjectView | undefined;
  // The sidebar is folded to its rail (or below the width that holds it open).
  folded: boolean;
  phone: boolean;
  connection: Connection;
  agents: Agent[] | null | undefined;
  pill: PillState;
  items: readonly Item[];
  collectionOf: (name: string) => CollectionView | undefined;
  // The phone's panel button.
  panel?: ReactNode;
  // Opens the activity drawer, from the agents dropdown.
  onActivity?: () => void;
  // Every project on this machine, for the switcher and the line beside it.
  projects?: readonly ProjectOverview[] | undefined;
};

// Three zones: where you are (the project, over its collections), the mark (centre) and the agents
// connected to this project. On a phone the mark moves into the panel.
export function Topbar({
  attention,
  project,
  folded,
  phone,
  connection,
  agents,
  pill,
  items,
  collectionOf,
  panel,
  onActivity,
  projects,
}: TopbarProps) {
  return (
    <header className="topbar" data-folded={folded || undefined}>
      <div className="topbar-start">
        {panel}
        <ProjectPill project={project} projects={projects} folded={folded} phone={phone} />
        {phone ? null : <Elsewhere projects={projects} />}
      </div>
      {phone ? null : (
        <div className="topbar-centre">
          <Brand attention={attention} />
        </div>
      )}
      <div className="topbar-end">
        <LivePill
          state={pill}
          connection={connection}
          agents={agents ?? []}
          project={project?.name ?? ''}
          lookup={{ items, collectionOf }}
          phone={phone}
          onActivity={onActivity}
        />
      </div>
    </header>
  );
}
