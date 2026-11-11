import type { ReactNode } from 'react';
import { typeOfItem, useApp } from '../app/context.tsx';
import { agentOf, type TocaSection, tocaSection } from '../derive/toca.ts';
import { whenText } from '../derive/when.ts';
import { listOf, t, tx } from '../i18n/i18n.ts';
import { LaneHead } from '../lanes/LaneHead.tsx';
import { type LaneBlock, LaneList } from '../lanes/LaneList.tsx';
import { lookOf } from '../lanes/looks.ts';
import { stateWord } from '../preset-words.ts';
import { inboxOf, itemHref, whereOf } from '../projects.ts';
import type { Item, ProjectOverview } from '../types.ts';
import { dayLine } from '../views/toca/TocaView.tsx';

// Te espera (#/projects, SPEC §10.4, mock:1494-1502, 1776-1784): what waits for you in every
// project on this machine, on the lanes. This project, open now, with its rows as Te toca draws
// them; every other one with its rows, which open in their own tab when a server shows them.

const WAITS: readonly TocaSection[] = ['atasco', 'preguntas', 'revisiones', 'propios'];

function action(sec: TocaSection, agent: string | null): { a: string; sub: ReactNode } {
  const who = agent ? <b>{agent}</b> : '—';
  if (sec === 'atasco')
    return { a: t('projects.act.atasco'), sub: tx('projects.sub.holds', { agent: who }) };
  if (sec === 'preguntas')
    return { a: t('projects.act.preguntas'), sub: tx('projects.sub.asks', { agent: who }) };
  if (sec === 'propios') return { a: t('projects.act.propios'), sub: t('projects.sub.yours') };
  return {
    a: t('projects.act.revisiones'),
    sub: agent ? tx('projects.sub.hands', { agent: who }) : '',
  };
}

// The rows of the project this server shows: what waits for you, the one waiting longest first.
export function hereBlocks(
  app: Pick<ReturnType<typeof useApp>, 'all' | 'now' | 'feed' | 'collectionOf' | 'route'>,
  name: string,
): LaneBlock[] {
  const ctx = {
    now: app.now,
    feed: app.feed,
    types: (it: Item) => typeOfItem(it, app.collectionOf),
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
      count: rows.length,
      gloss: t('projects.openNow'),
    },
  ];
  if (rows.length === 0)
    blocks.push({ kind: 'empty', key: `empty:p:${name}`, content: t('projects.emptyHere') });
  for (const { it, sec } of rows) {
    const when = whenText(it, app.now);
    const { a, sub } = action(sec, agentOf(it, app.feed));
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
                {it.collection} › {state}
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
      count: project.waiting.length,
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
    const served = project.served !== undefined;
    blocks.push({
      kind: 'row',
      key: `${project.id}:${it.id}`,
      lane: 'you',
      look: 'yours',
      sec: key,
      inert: !served,
      content: (
        <div className="main-c">
          <div className="t" data-leaf="" data-title="">
            <span className="tt">{it.title}</span>
          </div>
          <div className="m" data-leaf="">
            <span className="id">{it.id}</span>
            <span className="mpt">
              <span className="sep">·</span>
              <span className="stp you">{it.state}</span>
            </span>
            <span className="mpt">
              <span className="sep">·</span>
              <span>{served ? t('projects.inTab') : t('projects.noServer')}</span>
            </span>
          </div>
        </div>
      ),
    });
  }
  return blocks;
}

export function ProjectsInbox() {
  const app = useApp();
  const name = app.project?.name ?? '';
  const projects = app.projects ?? [];
  const others = projects.filter((p) => !p.current);
  const shown = others.filter((p) => p.waiting.length > 0 || p.unavailable !== undefined);
  const blocks = [...hereBlocks(app, name), ...shown.flatMap(elsewhereBlocks)];
  const inbox = inboxOf(others);
  const open = (key: string) => {
    for (const p of others) {
      const it = p.waiting.find((w) => `${p.id}:${w.id}` === key);
      const href = it ? itemHref(p, it) : undefined;
      if (href) {
        window.open(href, '_blank', 'noopener');
        return;
      }
    }
    if (app.route.item === key) app.closeItem();
    else app.openItem(key);
  };
  const quiet = [
    ...others
      .filter((p) => p.waiting.length === 0 && p.unavailable === undefined)
      .map((p) => p.name),
  ];
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
              ? tx('projects.dek', { name, serve: <em>otea serve</em> })
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
