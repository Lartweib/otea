import { useState } from 'react';
import { activeLease } from '../../active-lease.ts';
import { typeOfItem, useApp } from '../../app/context.tsx';
import { EmptyProject } from '../../components/EmptyProject.tsx';
import { t, tx } from '../../i18n/i18n.ts';
import { Button } from '../../kit/Button.tsx';
import { Count } from '../../kit/Count.tsx';
import { Icon } from '../../kit/Icon.tsx';
import { Swap } from '../../kit/Swap.tsx';
import { LaneHead } from '../../lanes/LaneHead.tsx';
import { LaneList } from '../../lanes/LaneList.tsx';
import { QueuedCaptures } from '../../offline/QueuedCaptures.tsx';
import { discard, useQueue } from '../../offline/queue-store.ts';
import { liveAgents } from '../../presence.ts';
import type { Item } from '../../types.ts';
import { dayLine, tocaBlocks, universeOf } from './blocks.tsx';
import { atascoDek, tocaDek } from './dek.ts';
import { type Today, todayCounts } from './today.ts';

// Te toca and Atasco (SPEC §8.1, mock:1460-1493; agents mock §4): one centred column, the head with
// its dek and the day's recap under it, the lanes with the sections in order, closed work on the
// trunk. Who does what is on each row and in the topbar's menu; an agent's last hours in its sheet.

export { dayLine, roundOf, rowCall, tocaBlocks, universeOf } from './blocks.tsx';

// The day's recap under the title: what they handed over, what you approved (in your colour) and
// what you sent back.
function Recap({ today, phone }: { today: Today; phone: boolean }) {
  if (phone) {
    return (
      <p className="p-recap" data-leaf="">
        {t('toca.colophon', {
          handed: String(today.handed),
          approved: String(today.approved),
          sent: String(today.sent),
        })}
      </p>
    );
  }
  return (
    <div className="recap" data-leaf="">
      <span>
        {tx('toca.colophon', {
          handed: <Count value={today.handed} hold />,
          approved: <Count className="you" value={today.approved} hold />,
          sent: <Count value={today.sent} hold />,
        })}
      </span>
      <span className="rule" />
    </div>
  );
}

// Nobody connected (agents mock §4): one block with the way to connect one, counting the work on
// an agent's turn that nobody has taken.
function NoAgents({
  items,
  now,
  onConnect,
}: {
  items: Item[];
  now: number;
  onConnect: () => void;
}) {
  const waiting = items.filter((it) => it.turn === 'agent' && !activeLease(it.lease, now)).length;
  return (
    <div className="noagents" data-leaf="">
      <svg viewBox="-12 -12 24 24" width="34" height="34" aria-hidden="true">
        <circle
          r="7"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="1.3"
          strokeDasharray="2.4 2.2"
        />
      </svg>
      <div>
        <h4>{t('toca.noAgents.title')}</h4>
        <p>
          {waiting ? t('toca.noAgents.waiting', { count: waiting }) : t('toca.noAgents.nothing')}
        </p>
        <div className="acts">
          <Button variant="quiet" onClick={onConnect}>
            <Icon name="plus" />
            {t('toca.connect')}
          </Button>
          <code className="cmd">{t('toca.noAgents.command')}</code>
        </div>
      </div>
    </div>
  );
}

export function TocaView({ atasco = false }: { atasco?: boolean }) {
  const app = useApp();
  const types = (it: Item) => typeOfItem(it, app.collectionOf);
  const ctx = { now: app.now, items: app.all, types };
  const today = todayCounts(app.feed, ctx);
  const open = (id: string) => (app.route.item === id ? app.closeItem() : app.openItem(id));
  // No item on any board (every project has Pedidos, so never no board): the project's own page.
  const empty = app.items.status === 'ready' && !atasco && app.all.length === 0;
  // On the phone En camino comes folded in one line.
  const [encamino, setEncamino] = useState(false);
  // The day's recap sits under the title, on Te toca.
  const recap = !atasco;
  // Nobody connected, on the desk: the way to connect one, over the lanes.
  const lonely =
    !atasco && !app.phone && !empty && !!app.agents && liveAgents(app.agents).length === 0;
  // What was captured while the PC did not answer, until it goes.
  const queue = useQueue();

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
    dekKey = d.lead;
    dek = d.lead;
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
          {recap ? <Recap today={today} phone={app.phone} /> : null}
        </header>
        {atasco ? null : (
          <QueuedCaptures captures={queue.captures} onDiscard={(id) => void discard(id)} />
        )}
        {empty ? (
          <EmptyProject />
        ) : (
          <>
            {lonely ? <NoAgents items={app.all} now={app.now} onConnect={app.openConnect} /> : null}
            <LaneHead />
            <LaneList
              list={atasco ? 'atasco' : 'toca'}
              blocks={tocaBlocks(app, atasco, {
                onTriage: () => app.go({ view: 'triage' }),
                ...(app.phone ? { phone: { encamino, onFold: () => setEncamino((v) => !v) } } : {}),
              })}
              universe={universeOf(app.all, app.now)}
              sink
              drawInOnMount
              onRow={open}
            />
          </>
        )}
      </section>
    </div>
  );
}
