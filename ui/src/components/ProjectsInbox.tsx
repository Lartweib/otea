import { fetchProjects } from '../api.ts';
import { ageLabel } from '../format.ts';
import { type Connection, useBeat, useRemote } from '../hooks.ts';
import { listOf, t, tx } from '../i18n/i18n.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import { NodeMark } from '../kit/index.ts';
import { type Inbox, inboxOf, itemHref, projectHref, whereOf } from '../projects.ts';
import type { ProjectOverview, WaitingItem } from '../types.ts';

// Other projects write to their own databases, which this server's live feed does not watch: the
// inbox reads them again on this beat, and whenever this project changes.
const REFRESH_MS = 10_000;

// A row's node on your lane (x=40); the lanes themselves run behind the whole inbox.
function RowNode() {
  return (
    <svg className="pj-node" width="56" height="62" viewBox="0 0 56 62" aria-hidden="true">
      <NodeMark kind="you" cx={40} cy={21} r={6} />
    </svg>
  );
}

const projectIcon = (project: ProjectOverview) =>
  project.paths[0]?.kind === 'folder' ? 'stack' : 'git-branch';

function Count({ n }: { n: number }) {
  if (n === 0) return <span className="pj-zero">·</span>;
  return (
    <span className="pj-count" title={t('rail.waiting')}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4" />
      </svg>
      {n}
    </span>
  );
}

function ProjectsRail({ projects, waiting }: { projects: ProjectOverview[]; waiting: number }) {
  return (
    <nav className="rail pj-rail" aria-label={t('projects.aria')}>
      <div className="rail-head">
        <span className="t-label rail-label">{t('projects.label')}</span>
      </div>
      <a className="rail-entry" href="#/projects" aria-current="page">
        <span className="pj-entry">
          <TypeIcon name="inbox" size={14} />
          <span className="rail-name">{t('projects.title')}</span>
        </span>
        <Count n={waiting} />
      </a>
      {projects.map((project) => {
        const href = projectHref(project);
        const body = (
          <>
            <span className="pj-entry">
              <TypeIcon name={projectIcon(project)} size={14} />
              <span className="rail-name">{project.name}</span>
            </span>
            <Count n={project.waiting.length} />
          </>
        );
        return href ? (
          <a key={project.id} className="rail-entry" href={href}>
            {body}
          </a>
        ) : (
          <span key={project.id} className="rail-entry pj-off" title={whereOf(project)}>
            {body}
          </span>
        );
      })}
    </nav>
  );
}

function Row({ project, item, now }: { project: ProjectOverview; item: WaitingItem; now: number }) {
  const href = itemHref(project, item);
  const title = href ? (
    <a className="ttl pj-link" href={href}>
      {item.title}
    </a>
  ) : (
    <span className="ttl">{item.title}</span>
  );
  return (
    <li className="pj-row" data-off={href ? undefined : true}>
      <RowNode />
      <span className="pj-type">
        <TypeIcon name={item.icon} size={16} />
      </span>
      <span className="pj-t1">{title}</span>
      <span className="pj-t2">
        <span>{item.id}</span>
        <span aria-hidden="true">·</span>
        <span>{item.state}</span>
      </span>
      <span className="pj-when">{ageLabel(item.updatedAt, now)}</span>
    </li>
  );
}

function ProjectHead({ project }: { project: ProjectOverview }) {
  const href = projectHref(project);
  return (
    <div className="pj-head">
      <span className="pj-head-icon">
        <TypeIcon name={projectIcon(project)} size={14} />
      </span>
      <span className="pj-head-name">{project.name}</span>
      <span className="pj-head-count">{project.waiting.length}</span>
      <span className="pj-head-path t-cap">{whereOf(project)}</span>
      {href ? (
        <a className="pj-head-open t-cap" href={href}>
          {project.current ? t('projects.here') : t('projects.open')}
        </a>
      ) : (
        <span className="pj-head-open t-cap" data-off="true">
          {tx('projects.notServed', { command: <code>otea serve</code> })}
        </span>
      )}
    </div>
  );
}

function Rest({ inbox, alone }: { inbox: Inbox; alone: boolean }) {
  const lines = [];
  if (inbox.waiting === 0) lines.push(<b key="nothing">{t('projects.nothing')}</b>);
  if (inbox.withAgents > 0) {
    lines.push(
      <span key="agents">
        {tx('projects.withAgents', {
          count: inbox.withAgents,
          projects: <b>{listOf(inbox.agentProjects)}</b>,
        })}
      </span>,
    );
  }
  if (inbox.idle.length > 0) {
    lines.push(
      <span key="idle">
        {tx('projects.idle', { count: inbox.idle.length, projects: <b>{listOf(inbox.idle)}</b> })}
      </span>,
    );
  }
  for (const project of inbox.unavailable) {
    lines.push(
      <span key={project.id} className="pj-unavailable">
        {t('projects.unavailable', { name: project.name, reason: project.unavailable ?? '' })}
      </span>,
    );
  }
  if (alone) {
    lines.push(<span key="alone">{tx('projects.none', { command: <code>otea init</code> })}</span>);
  }
  return (
    <div className="pj-rest">
      {lines.map((line) => (
        <p key={line.key}>{line}</p>
      ))}
    </div>
  );
}

type ProjectsInboxProps = { version: number; connection: Connection };

// What waits for you in every project on this machine, grouped by project, and only that: the
// items with agents and the closed ones stay in their projects.
export function ProjectsInbox({ version, connection }: ProjectsInboxProps) {
  const beat = useBeat(REFRESH_MS);
  const projects = useRemote(fetchProjects, version * 1000 + beat, connection);
  if (projects.status !== 'ready') {
    return (
      <main className="layout pj-layout">
        <p
          className={
            projects.status === 'failed' ? 'pane-message action-error' : 'pane-message t-small'
          }
        >
          {projects.status === 'failed' ? projects.message : t('common.loading')}
        </p>
      </main>
    );
  }
  const inbox = inboxOf(projects.value);
  const now = Date.now();
  return (
    <main className="layout pj-layout">
      <ProjectsRail projects={projects.value} waiting={inbox.waiting} />
      <section className="pj-inbox" aria-label={t('projects.title')}>
        <div className="list-head pj-list-head">
          <span className="lane-names" aria-hidden="true">
            <span>{t('list.laneAgents')}</span>
            <span className="lane-names-you">{t('list.laneYou')}</span>
          </span>
          <h2 className="t-h">{t('projects.title')}</h2>
          <span className="t-cap">{inbox.waiting}</span>
        </div>
        <div className="pj-run">
          {inbox.waiting > 0 ? (
            <div className="pj-group">
              <span className="pj-group-label">{t('projects.waiting')}</span>
              <span className="pj-group-count">{inbox.waiting}</span>
              <i className="pj-group-rule" />
            </div>
          ) : null}
          {inbox.groups.map((project) => (
            <section key={project.id} className="pj-project" aria-label={project.name}>
              <ProjectHead project={project} />
              <ul className="pj-rows">
                {project.waiting.map((item) => (
                  <Row key={item.id} project={project} item={item} now={now} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <Rest inbox={inbox} alone={projects.value.length < 2} />
      </section>
    </main>
  );
}
