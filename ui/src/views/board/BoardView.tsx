import { useApp } from '../../app/context.tsx';
import { whenText } from '../../derive/when.ts';
import { t } from '../../i18n/i18n.ts';
import { AgentMark } from '../../kit/Marks.tsx';
import { laneOf } from '../../lanes/geometry.ts';
import { LaneHead } from '../../lanes/LaneHead.tsx';
import { type LaneBlock, LaneList } from '../../lanes/LaneList.tsx';
import { lookOf } from '../../lanes/looks.ts';
import type { Item } from '../../types.ts';
import { universeOf } from '../toca/TocaView.tsx';

// A board (SPEC §10.1). Foundation stub: the head and Lista rows on a LaneList, open work first,
// then closed work on the trunk. The boards slice replaces it with Pasos, Lista and Tabla.

const ORDER = { human: 0, agent: 1, none: 2 } as const;

export function BoardView({ board }: { board: string }) {
  const app = useApp();
  const items = app.all
    .filter((it) => it.collection === board)
    .sort(
      (a, b) => ORDER[a.turn] - ORDER[b.turn] || Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
    );
  const blocks: LaneBlock[] = items.length
    ? items.map((it: Item) => {
        const when = whenText(it, app.now);
        const holder = it.lease?.holder ?? it.expiredLease?.holder ?? null;
        return {
          kind: 'row',
          key: it.id,
          lane: laneOf(it.turn),
          look: lookOf(it, app.now),
          sec: 'all',
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
                  <span className="sep">·</span>
                  <span className={it.turn === 'human' ? 'stp you' : 'stp'}>{it.state}</span>
                </div>
              </div>
              <span className="who" data-leaf="" data-s={`${it.id}:who`}>
                {it.turn === 'human' ? (
                  <AgentMark you />
                ) : (
                  <AgentMark name={it.turn === 'none' ? null : holder} />
                )}
              </span>
              <span
                className={when.warn ? 'age warn' : 'age'}
                data-leaf=""
                data-s={`${it.id}:when`}
              >
                {when.text}
              </span>
            </>
          ),
        };
      })
    : [
        {
          kind: 'empty',
          key: 'empty:all',
          big: true,
          content: <p>{t('boardView.empty', { board })}</p>,
        },
      ];
  const open = (id: string) => (app.route.item === id ? app.closeItem() : app.openItem(id));
  return (
    <div className="board">
      <header className="bhead" data-enter="head">
        <div>
          <div className="kicker" data-leaf="">
            <b>{t('boardView.kicker')}</b> &nbsp;·&nbsp; {app.project?.name ?? ''}
          </div>
          <h1 className="display" data-leaf="">
            {board}
          </h1>
        </div>
      </header>
      <div className="lista">
        <LaneHead />
        <LaneList
          list="board"
          blocks={blocks}
          universe={universeOf(app.all, app.now)}
          drawInOnMount
          onRow={open}
        />
      </div>
    </div>
  );
}
