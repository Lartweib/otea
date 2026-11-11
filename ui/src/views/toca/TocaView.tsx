import { type App, typeOfItem, useApp } from '../../app/context.tsx';
import {
  stuckCount,
  TOCA_SECTIONS,
  type TocaSection,
  tocaCount,
  tocaSection,
} from '../../derive/toca.ts';
import { whenText } from '../../derive/when.ts';
import { language, type PlainKey, t } from '../../i18n/i18n.ts';
import { laneOf } from '../../lanes/geometry.ts';
import type { Universe } from '../../lanes/handoff.ts';
import { LaneHead } from '../../lanes/LaneHead.tsx';
import { type LaneBlock, LaneList } from '../../lanes/LaneList.tsx';
import { lookOf } from '../../lanes/looks.ts';
import type { Item } from '../../types.ts';

// Te toca and Atasco (SPEC §8.1). Foundation stub: the head, the sections from tocaSection on a
// LaneList, plain rows that open their item, and the agents column's room. The lists slice
// replaces it.

const GLOSS: Partial<Record<TocaSection, PlainKey>> = {
  encamino: 'toca.gloss.encamino',
  cerrados: 'toca.gloss.cerrados',
};

// The day as the kicker says it: miércoles 11 de noviembre.
export function dayLine(now: number): string {
  return new Intl.DateTimeFormat(language(), { weekday: 'long', day: 'numeric', month: 'long' })
    .format(now)
    .replace(',', '');
}

// Every item's lane, look and closing, for the handoff's virtual ends.
export function universeOf(items: readonly Item[], now: number): Universe {
  return new Map(
    items.map((it) => [
      it.id,
      { lane: laneOf(it.turn), look: lookOf(it, now), closed: it.turn === 'none' },
    ]),
  );
}

export function tocaBlocks(
  app: Pick<App, 'all' | 'now' | 'feed' | 'collectionOf' | 'route'>,
  atasco: boolean,
): LaneBlock[] {
  const ctx = {
    now: app.now,
    feed: app.feed,
    types: (it: Item) => typeOfItem(it, app.collectionOf),
  };
  const by = new Map<TocaSection, Item[]>();
  for (const it of app.all) {
    const s = tocaSection(it, ctx);
    if (s) by.set(s, [...(by.get(s) ?? []), it]);
  }
  const blocks: LaneBlock[] = [];
  for (const sec of TOCA_SECTIONS) {
    if (atasco && sec !== 'atasco') continue;
    const at = (it: Item) => Date.parse(it.updatedAt);
    const rows =
      sec === 'cerrados'
        ? (by.get(sec) ?? []).sort((a, b) => at(b) - at(a)).slice(0, 12)
        : (by.get(sec) ?? []).sort((a, b) => at(a) - at(b));
    const gloss = GLOSS[sec];
    blocks.push({
      kind: 'sec',
      key: `sec:${sec}`,
      title: t(`toca.sec.${sec}` as PlainKey),
      count: rows.length,
      ...(gloss ? { gloss: t(gloss) } : {}),
    });
    if (!rows.length)
      blocks.push({
        kind: 'empty',
        key: `empty:${sec}`,
        content: t(`toca.empty.${sec}` as PlainKey),
      });
    for (const it of rows) {
      const when = whenText(it, app.now);
      blocks.push({
        kind: 'row',
        key: it.id,
        lane: laneOf(it.turn),
        look: lookOf(it, app.now),
        sec,
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
                  {it.collection} › {it.state}
                </span>
              </div>
            </div>
            <div className={when.warn ? 'age warn' : 'age'} data-leaf="" data-s={`${it.id}:when`}>
              {when.text}
            </div>
          </>
        ),
      });
    }
  }
  return blocks;
}

export function TocaView({ atasco = false }: { atasco?: boolean }) {
  const app = useApp();
  const stuck = stuckCount(app.all, { now: app.now });
  const waiting = tocaCount(app.all, { now: app.now });
  const dek = atasco
    ? stuck
      ? t('toca.dekStuck', { count: stuck })
      : t('toca.dekStuckNone')
    : waiting
      ? t('toca.dek', { count: waiting })
      : t('toca.dekNone');
  const open = (id: string) => (app.route.item === id ? app.closeItem() : app.openItem(id));
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
          <p className="dek" data-leaf="">
            {dek}
          </p>
        </header>
        <LaneHead />
        <LaneList
          list={atasco ? 'atasco' : 'toca'}
          blocks={tocaBlocks(app, atasco)}
          universe={universeOf(app.all, app.now)}
          sink
          drawInOnMount
          onRow={open}
        />
      </section>
      <aside className="agents" data-enter="fade" data-leaf="" />
    </div>
  );
}
