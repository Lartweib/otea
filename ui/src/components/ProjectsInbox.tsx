import type { ReactNode } from 'react';
import { typeOfItem, useApp } from '../app/context.tsx';
import { projectPage } from '../base.ts';
import { onPublishedBoard } from '../board-studio/home/boards-store.ts';
import { agentOf, askingAgent, type TocaSection, tocaSection } from '../derive/toca.ts';
import { whenText } from '../derive/when.ts';
import { listOf, t, tx } from '../i18n/i18n.ts';
import { LaneHead } from '../lanes/LaneHead.tsx';
import { type LaneBlock, LaneList } from '../lanes/LaneList.tsx';
import { lookOf } from '../lanes/looks.ts';
import { keptStateWord, stateWord } from '../preset-words.ts';
import { inboxOf, itemHref, whereOf } from '../projects.ts';
import { topicsHash } from '../selection.ts';
import { capped } from '../topics.ts';
import type { AnsweredTopic, Item, ProjectOverview } from '../types.ts';
import { rowCall } from '../views/toca/blocks.tsx';
import { dayLine } from '../views/toca/TocaView.tsx';

// Te espera (#/projects, SPEC §10.4, mock:1494-1502, 1776-1784): what waits for you in every
// project on this machine, on the lanes. This project, open now, with its rows as Te toca draws
// them; every other one with its rows, which open in their own tab when a server shows them.

const WAITS: readonly TocaSection[] = ['atasco', 'preguntas', 'revisiones', 'propios'];

function action(
  sec: Exclude<TocaSection, 'propios'>,
  agent: string | null,
): { a: string; sub: ReactNode } {
  const who = agent ? <b>{agent}</b> : '—';
  if (sec === 'atasco')
    return { a: t('projects.act.atasco'), sub: tx('projects.sub.holds', { agent: who }) };
  if (sec === 'preguntas')
    return { a: t('projects.act.preguntas'), sub: tx('projects.sub.asks', { agent: who }) };
  return {
    a: t('projects.act.revisiones'),
    sub: agent ? tx('projects.sub.hands', { agent: who }) : '',
  };
}

// Where a topic row opens: the topic on its project's page (this one's, or another of this server).
function topicHref(project: string | undefined, id?: string): string {
  return project === undefined ? topicsHash(id) : projectPage(project, topicsHash(id));
}

// A project's answered topics: yours to read, never work. A few rows, then how many more wait on
// its topics page, so a chatty day never floods the inbox. `project`: another project's id.
function topicBlocks(
  topics: readonly AnsweredTopic[],
  sec: string,
  where: { key: string; project?: string; name?: string },
): LaneBlock[] {
  const { shown, more } = capped(topics);
  const blocks: LaneBlock[] = shown.map((topic) => ({
    kind: 'row',
    key: `topic:${where.key}:${topic.id}`,
    lane: 'you',
    look: 'yours',
    sec,
    content: (
      <>
        <div className="main-c">
          <div className="t" data-leaf="" data-title="">
            <span className="tt">{topic.title}</span>
          </div>
          <div className="m" data-leaf="">
            <span className="id">{topic.id}</span>
            {where.name ? (
              <span className="mpt">
                <span className="sep">·</span>
                <span className="pid">{where.name}</span>
              </span>
            ) : null}
            <span className="mpt">
              <span className="sep">·</span>
              <span className="stp you">{t('projects.topic.kind')}</span>
            </span>
          </div>
        </div>
        <div className="a" data-leaf="">
          {t('projects.topic.act')}
          {topic.agent ? <small>{t('projects.topic.sub', { agent: topic.agent })}</small> : null}
        </div>
      </>
    ),
  }));
  if (more > 0)
    blocks.push({
      kind: 'empty',
      key: `more:${where.key}`,
      content: (
        <a className="inbox-more" href={topicHref(where.project)}>
          {t('projects.topics.more', { count: more })}
        </a>
      ),
    });
  return blocks;
}

// Where a topic row of the inbox leads, from its key: `topic:<project id or here>:<topic id>`.
export function topicRowHref(key: string): string | undefined {
  const match = /^topic:(.+):([^:]+)$/.exec(key);
  if (!match) return undefined;
  const [, project, id] = match;
  return topicHref(project === 'here' ? undefined : project, id);
}

// Your own step says who takes it after you, as Te toca does: never who opened it.
function ownStep(it: Item, ctx: Parameters<typeof rowCall>[2]): { a: string; sub: ReactNode } {
  const call = rowCall(it, 'propios', ctx);
  return {
    a: call.act,
    sub: call.sub.agent
      ? tx(call.sub.key as 'toca.sub.then', { agent: <b>{call.sub.agent}</b> })
      : t(call.sub.key as 'toca.sub.thenAgent'),
  };
}

// The rows of the project this server shows: what waits for you, the one waiting longest first.
export function hereBlocks(
  app: Pick<ReturnType<typeof useApp>, 'all' | 'now' | 'feed' | 'collectionOf' | 'route'>,
  name: string,
  topics: readonly AnsweredTopic[] = [],
): LaneBlock[] {
  const ctx = {
    now: app.now,
    feed: app.feed,
    types: (it: Item) => typeOfItem(it, app.collectionOf),
    onBoard: (it: Item) => onPublishedBoard(it.collection),
  };
  const rows = app.all
    .map((it) => ({ it, sec: tocaSection(it, ctx) }))
    .filter((r): r is { it: Item; sec: TocaSection } => !!r.sec && WAITS.includes(r.sec))
    .sort((a, b) => Date.parse(a.it.updatedAt) - Date.parse(b.it.updatedAt));
  const blocks: LaneBlock[] = [
    {
      kind: 'sec',
      key: `p:${name}`,
      title: name,
      count: rows.length + topics.length,
      gloss: t('projects.openNow'),
    },
  ];
  if (rows.length === 0 && topics.length === 0)
    blocks.push({ kind: 'empty', key: `empty:p:${name}`, content: t('projects.emptyHere') });
  for (const { it, sec } of rows) {
    const when = whenText(it, app.now);
    const asker = sec === 'preguntas' ? askingAgent(it, app.feed) : null;
    const { a, sub } =
      sec === 'propios' ? ownStep(it, ctx) : action(sec, asker ?? agentOf(it, app.feed));
    const state = stateWord(typeOfItem(it, app.collectionOf), it.state);
    blocks.push({
      kind: 'row',
      key: it.id,
      lane: sec === 'atasco' ? 'ag' : 'you',
      look: lookOf(it, app.now),
      sec: `p:${name}`,
      selected: app.route.item === it.id,
      content: (
        <>
          <div className="main-c">
            <div className="t" data-leaf="" data-title="">
              <span className="tt" data-s={`${it.id}:t`}>
                {it.title}
              </span>
            </div>
            <div className="m" data-leaf="">
              <span className="id" data-s={`${it.id}:id`}>
                {it.id}
              </span>
              <span className="bd">
                <span className="bdc">{it.collection}</span>
                <span className="bds">› {state}</span>
              </span>
            </div>
          </div>
          <div className={sec === 'atasco' ? 'a warn' : 'a'} data-leaf="">
            {a}
            {sub ? <small>{sub}</small> : null}
          </div>
          <div className={when.warn ? 'age warn' : 'age'} data-leaf="" data-s={`${it.id}:when`}>
            {when.text}
          </div>
        </>
      ),
    });
  }
  blocks.push(...topicBlocks(topics, `p:${name}`, { key: 'here' }));
  return blocks;
}

// Another project's section: its name, its count, where it lives; its rows say where they open.
export function elsewhereBlocks(project: ProjectOverview): LaneBlock[] {
  const key = `p:${project.id}`;
  const blocks: LaneBlock[] = [
    {
      kind: 'sec',
      key,
      title: project.name,
      count: project.waiting.length + (project.topics?.length ?? 0),
      gloss: whereOf(project) ?? '',
    },
  ];
  if (project.unavailable !== undefined) {
    blocks.push({
      kind: 'empty',
      key: `empty:${key}`,
      content: t('projects.unavailable', { name: project.name, reason: project.unavailable }),
    });
  }
  for (const it of project.waiting) {
    const readable = project.unavailable === undefined;
    blocks.push({
      kind: 'row',
      key: `${project.id}:${it.id}`,
      lane: 'you',
      look: 'yours',
      sec: key,
      inert: !readable,
      content: (
        <div className="main-c">
          <div className="t" data-leaf="" data-title="">
            <span className="tt">{it.title}</span>
          </div>
          <div className="m" data-leaf="">
            {/* Ids repeat across projects (PED-1 in each): the project goes with it. */}
            <span className="id">{it.id}</span>
            <span className="mpt">
              <span className="sep">·</span>
              <span className="pid">{project.name}</span>
            </span>
            <span className="mpt">
              <span className="sep">·</span>
              <span className="stp you">{keptStateWord(it.stateName ?? it.state)}</span>
            </span>
          </div>
        </div>
      ),
    });
  }
  if (project.unavailable === undefined)
    blocks.push(
      ...topicBlocks(project.topics ?? [], key, {
        key: project.id,
        project: project.id,
        name: project.name,
      }),
    );
  return blocks;
}

export function ProjectsInbox() {
  const app = useApp();
  const name = app.project?.name ?? '';
  const projects = app.projects ?? [];
  const others = projects.filter((p) => !p.current);
  const shown = others.filter(
    (p) => p.waiting.length > 0 || (p.topics?.length ?? 0) > 0 || p.unavailable !== undefined,
  );
  const here = projects.find((p) => p.current)?.topics ?? [];
  const blocks = [...hereBlocks(app, name, here), ...shown.flatMap(elsewhereBlocks)];
  const inbox = inboxOf(others);
  const open = (key: string) => {
    const topic = topicRowHref(key);
    if (topic) {
      window.location.assign(topic);
      return;
    }
    for (const p of others) {
      const it = p.waiting.find((w) => `${p.id}:${w.id}` === key);
      const href = it ? itemHref(p, it) : undefined;
      if (href) {
        // Another project of this same server: its page, in this window.
        window.location.assign(href);
        return;
      }
    }
    if (app.route.item === key) app.closeItem();
    else app.openItem(key);
  };
  // Idle: nothing open at all; one whose open work is all with agents is counted apart.
  const quiet = inbox.idle;
  return (
    <div className="panel inbox">
      <section className="listcol">
        <header className="head" data-enter="head">
          <div className="kicker" data-leaf="">
            <b>{t('projects.kicker')}</b> &nbsp;·&nbsp; {dayLine(app.now)}
          </div>
          <h1 className="display" data-leaf="">
            {t('projects.display')}
          </h1>
          <p className="dek" data-leaf="">
            {others.length > 0
              ? tx('projects.dek', { name })
              : tx('projects.dekAlone', { name, init: <em>otea init</em> })}
          </p>
        </header>
        <LaneHead />
        <LaneList list="projects" blocks={blocks} drawInOnMount onRow={open} />
        {quiet.length > 0 || inbox.withAgents > 0 ? (
          <p className="inbox-foot" data-leaf="">
            {quiet.length > 0
              ? t('projects.idle', { count: quiet.length, projects: listOf(quiet) })
              : null}
            {quiet.length > 0 && inbox.withAgents > 0 ? ' ' : null}
            {inbox.withAgents > 0
              ? t('projects.withAgents', {
                  count: inbox.withAgents,
                  projects: listOf(inbox.agentProjects),
                })
              : null}
          </p>
        ) : null}
      </section>
      <aside className="agents" data-leaf="" />
    </div>
  );
}
