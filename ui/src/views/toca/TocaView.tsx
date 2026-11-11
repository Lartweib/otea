import { useState } from 'react';
import { typeOfItem, useApp } from '../../app/context.tsx';
import { EmptyProject } from '../../components/EmptyProject.tsx';
import { FirstRun } from '../../components/EmptyStates.tsx';
import { emptyKind } from '../../empty-states.ts';
import { t } from '../../i18n/i18n.ts';
import { Swap } from '../../kit/Swap.tsx';
import { LaneHead } from '../../lanes/LaneHead.tsx';
import { LaneList } from '../../lanes/LaneList.tsx';
import type { Item } from '../../types.ts';
import { AgentsColumn } from './AgentsColumn.tsx';
import { dayLine, tocaBlocks, universeOf } from './blocks.tsx';
import { atascoDek, tocaDek } from './dek.ts';
import { stateLookup, todayCounts } from './today.ts';

// Te toca and Atasco (SPEC §8.1, mock:1460-1493): the head with its dek, the lanes with the
// sections in order, closed work on the trunk, and the agents column beside them.

export { dayLine, roundOf, rowCall, tocaBlocks, universeOf } from './blocks.tsx';

export function TocaView({ atasco = false }: { atasco?: boolean }) {
  const app = useApp();
  const types = (it: Item) => typeOfItem(it, app.collectionOf);
  const ctx = { now: app.now, items: app.all, types };
  const today = todayCounts(app.feed, ctx);
  const stateOf = stateLookup(ctx);
  const turnOf = (id: string, state: string) => stateOf(id, state)?.turn;
  const open = (id: string) => (app.route.item === id ? app.closeItem() : app.openItem(id));
  const [firstPreset, setFirstPreset] = useState<string>();
  // No board yet: the first run offers one. Boards but no item anywhere: the project's own page.
  const nothing =
    app.items.status === 'ready' && !atasco
      ? emptyKind({
          collections: app.collections.length,
          scoped: app.all,
          collection: undefined,
          byTurn: false,
        })
      : undefined;

  let dekKey: string;
  let dek: React.ReactNode;
  if (atasco) {
    const d = atascoDek(app.all, app.now);
    dekKey = d.lead + d.quiet.map((q) => q.agent + q.text).join(';');
    dek = (
      <>
        {d.lead}
        {d.quiet.map((q, i) => (
          <span key={q.agent + String(i)}>
            {i ? '; ' : ''}
            <em>{q.agent}</em>
            {q.text}
          </span>
        ))}
        {d.quiet.length ? '.' : ''}
      </>
    );
  } else {
    const d = tocaDek(app.all, today.handed, app.now);
    dekKey = d.lead + d.handed.before + d.handed.n;
    dek = (
      <>
        {d.lead} {d.handed.before}
        {d.handed.n ? <em>{d.handed.n}</em> : null}
        {d.handed.after}
      </>
    );
  }

  return (
    <div className="panel">
      <section className="listcol">
        <header className="head" data-enter="head">
          <div className="kicker" data-leaf="">
            <b>{app.project?.name ?? ''}</b> &nbsp;·&nbsp; {dayLine(app.now)}
          </div>
          <h1 className="display" data-leaf="">
            {atasco ? t('toca.atasco') : t('toca.title')}
          </h1>
          <div className="dek" data-leaf="">
            <Swap k={dekKey} as="div">
              {dek}
            </Swap>
          </div>
        </header>
        {nothing === 'first-run' ? (
          <FirstRun presets={app.presets} chosen={firstPreset} onChoose={setFirstPreset} route />
        ) : nothing === 'empty-project' ? (
          <EmptyProject />
        ) : (
          <>
            <LaneHead />
            <LaneList
              list={atasco ? 'atasco' : 'toca'}
              blocks={tocaBlocks(app, atasco, { onTriage: () => app.go({ view: 'triage' }) })}
              universe={universeOf(app.all, app.now)}
              sink
              drawInOnMount
              onRow={open}
            />
          </>
        )}
      </section>
      <AgentsColumn
        agents={app.agents}
        items={app.all}
        feed={app.feed}
        now={app.now}
        today={today}
        types={types}
        turnOf={turnOf}
        onConnect={app.openConnect}
      />
    </div>
  );
}
