import { activeLease } from '../../active-lease.ts';
import type { FeedEvent } from '../../activity.ts';
import { type App, typeOfItem } from '../../app/context.tsx';
import { onPublishedBoard } from '../../board-studio/home/boards-store.ts';
import { mainPath } from '../../derive/path.ts';
import {
  agentOf,
  handedNote,
  TOCA_SECTIONS,
  type TocaContext,
  type TocaSection,
  tocaSection,
} from '../../derive/toca.ts';
import { whenText } from '../../derive/when.ts';
import { language, type PlainKey, t, tx } from '../../i18n/i18n.ts';
import { Icon } from '../../kit/Icon.tsx';
import { laneOf } from '../../lanes/geometry.ts';
import type { Universe } from '../../lanes/handoff.ts';
import type { LaneBlock } from '../../lanes/LaneList.tsx';
import { lookOf } from '../../lanes/looks.ts';
import { stateWord } from '../../preset-words.ts';
import { roundsOf } from '../../rounds.ts';
import type { Item, TypeView } from '../../types.ts';
import { spanText } from './words.ts';

// The blocks of Te toca and Atasco (SPEC §8.1, mock:1694-1804): the sections in order, each with
// its count, gloss and empty line, and the toca rows: title, where it is, the call to act and its
// small line, the age.

const GLOSS: Partial<Record<TocaSection, PlainKey>> = {
  encamino: 'toca.gloss.encamino',
  cerrados: 'toca.gloss.cerrados',
};

// Cerrados shows at most this many, newest first.
const CLOSED_SHOWN = 12;

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

// The rounds an item has been through: each agent handoff to you ends one; while an agent works
// again after you sent it back, the next is under way.
export function roundOf(
  item: Item,
  feed: readonly FeedEvent[],
  type: TypeView | undefined,
): number {
  if (item.round !== undefined) return item.round;
  if (!type) return 0;
  const rounds = roundsOf(
    feed.filter((e) => e.itemId === item.id),
    [],
    type.states,
  );
  const last = rounds.at(-1);
  return rounds.length + (item.turn === 'agent' && last?.verdict?.kind === 'sent-back' ? 1 : 0);
}

export type SubKey =
  | 'toca.sub.holds'
  | 'toca.sub.asks'
  | 'toca.sub.hands'
  | 'toca.sub.yourTurn'
  | 'toca.sub.then'
  | 'toca.sub.thenAgent'
  | 'toca.sub.thenClose'
  | 'toca.sub.does'
  | 'toca.sub.waitsFor'
  | 'toca.sub.waitsAgent'
  | 'toca.sub.waitsKids'
  | 'toca.sub.didIt'
  | 'toca.sub.closedBy'
  | 'toca.sub.closedByYou';

export type RowCall = { act: string; sub: { key: SubKey; agent?: string } };

const sub = (key: SubKey, agent?: string | null): RowCall['sub'] =>
  agent ? { key, agent } : { key };

// What the row asks of you, and its small line: who has it, who asks, who hands it over, who comes
// next (mock:1740-1747).
export function rowCall(item: Item, sec: TocaSection, ctx: TocaContext): RowCall {
  const { feed, now } = ctx;
  switch (sec) {
    case 'atasco':
      return {
        act: t('toca.act.atasco'),
        sub: sub('toca.sub.holds', item.expiredLease?.holder ?? agentOf(item, feed)),
      };
    case 'preguntas':
      return {
        act: t('toca.act.preguntas'),
        sub: sub('toca.sub.asks', handedNote(item, feed)?.agent),
      };
    case 'revisiones': {
      const who = handedNote(item, feed)?.agent ?? agentOf(item, feed);
      return {
        act: t('toca.act.revisiones'),
        sub: who ? sub('toca.sub.hands', who) : sub('toca.sub.yourTurn'),
      };
    }
    case 'propios': {
      const type = ctx.types(item);
      const path = type ? mainPath(type) : [];
      const next = path[path.indexOf(item.state) + 1];
      const turn = type?.states.find((s) => s.name === next)?.turn;
      if (turn === 'none') return { act: t('toca.act.propios'), sub: sub('toca.sub.thenClose') };
      const who = agentOf(item, feed);
      return {
        act: t('toca.act.propios'),
        sub: who ? sub('toca.sub.then', who) : sub('toca.sub.thenAgent'),
      };
    }
    case 'encamino': {
      const holder = activeLease(item.lease, now)?.holder;
      if (holder) return { act: t('toca.act.encamino'), sub: sub('toca.sub.does', holder) };
      if ((item.children?.open ?? 0) > 0)
        return { act: t('toca.act.encamino'), sub: sub('toca.sub.waitsKids') };
      const who = agentOf(item, feed);
      return {
        act: t('toca.act.encamino'),
        sub: who ? sub('toca.sub.waitsFor', who) : sub('toca.sub.waitsAgent'),
      };
    }
    case 'cerrados': {
      if (item.closes === 'discarded') {
        const closing = feed.findLast(
          (e) => e.itemId === item.id && e.type === 'transitioned' && e.data.to === item.state,
        );
        const by =
          closing?.actor.kind === 'agent' && typeof closing.data.via !== 'string'
            ? closing.actor.name
            : null;
        return {
          act: t('toca.act.dropped'),
          sub: by ? sub('toca.sub.closedBy', by) : sub('toca.sub.closedByYou'),
        };
      }
      const who = agentOf(item, feed);
      return {
        act: t('toca.act.done'),
        sub: who ? sub('toca.sub.didIt', who) : sub('toca.sub.closedByYou'),
      };
    }
  }
}

type TocaApp = Pick<App, 'all' | 'now' | 'feed' | 'collectionOf' | 'route'>;

function TocaRow({
  it,
  sec,
  app,
  ctx,
}: {
  it: Item;
  sec: TocaSection;
  app: TocaApp;
  ctx: TocaContext;
}) {
  const when = whenText(it, app.now);
  const type = ctx.types(it);
  const call = rowCall(it, sec, ctx);
  const stuck = sec === 'atasco' && it.expiredLease;
  const round = stuck ? 0 : roundOf(it, app.feed, type);
  return (
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
            {it.collection} › {stateWord(type, it.state)}
          </span>
          {stuck ? (
            <span className="mpt">
              <span className="sep">·</span>
              <span className="warn">
                {t('toca.quiet', {
                  agent: it.expiredLease?.holder ?? '',
                  time: spanText(app.now - Date.parse(it.expiredLease?.expiresAt ?? '')),
                })}
              </span>
            </span>
          ) : round >= 2 ? (
            <span className="mpt">
              <span className="sep">·</span>
              <span className="round">{t('toca.round', { n: round })}</span>
            </span>
          ) : null}
        </div>
      </div>
      <div className={sec === 'atasco' ? 'a warn' : 'a'} data-leaf="">
        {call.act}
        <small>
          {call.sub.agent
            ? tx(call.sub.key as 'toca.sub.holds', { agent: <b>{call.sub.agent}</b> })
            : t(call.sub.key as 'toca.sub.yourTurn')}
        </small>
      </div>
      <div className={when.warn ? 'age warn' : 'age'} data-leaf="" data-s={`${it.id}:when`}>
        {when.text}
      </div>
    </>
  );
}

export function tocaBlocks(
  app: TocaApp,
  atasco: boolean,
  o: { onTriage?: () => void } = {},
): LaneBlock[] {
  const ctx: TocaContext = {
    now: app.now,
    feed: app.feed,
    types: (it: Item) => typeOfItem(it, app.collectionOf),
    onBoard: (it: Item) => onPublishedBoard(it.collection),
  };
  const by = new Map<TocaSection, Item[]>();
  for (const it of app.all) {
    const s = tocaSection(it, ctx);
    if (s) by.set(s, [...(by.get(s) ?? []), it]);
  }
  const blocks: LaneBlock[] = [];
  const at = (it: Item) => Date.parse(it.updatedAt);
  for (const sec of TOCA_SECTIONS) {
    if (atasco && sec !== 'atasco') continue;
    const rows =
      sec === 'cerrados'
        ? (by.get(sec) ?? []).sort((a, b) => at(b) - at(a)).slice(0, CLOSED_SHOWN)
        : (by.get(sec) ?? []).sort((a, b) => at(a) - at(b));
    const gloss = GLOSS[sec];
    const triage = sec === 'revisiones' && !atasco && rows.length > 1;
    blocks.push({
      kind: 'sec',
      key: `sec:${sec}`,
      title: t(`toca.sec.${sec}` as PlainKey),
      count: rows.length,
      ...(gloss ? { gloss: t(gloss) } : {}),
      ...(triage
        ? {
            action: (
              <button
                type="button"
                className="sact"
                data-leaf=""
                onClick={(e) => {
                  e.stopPropagation();
                  o.onTriage?.();
                }}
              >
                <Icon name="triage" />
                {t('toca.triage')}
              </button>
            ),
          }
        : {}),
    });
    if (!rows.length)
      blocks.push({
        kind: 'empty',
        key: `empty:${sec}`,
        content: t(`toca.empty.${sec}` as PlainKey),
      });
    for (const it of rows) {
      blocks.push({
        kind: 'row',
        key: it.id,
        lane: laneOf(it.turn),
        look: lookOf(it, app.now),
        sec,
        selected: app.route.item === it.id,
        content: <TocaRow it={it} sec={sec} app={app} ctx={ctx} />,
      });
    }
  }
  return blocks;
}
