import { activeLease } from '../../active-lease.ts';
import type { FeedEvent } from '../../activity.ts';
import { type App, typeOfItem } from '../../app/context.tsx';
import { onPublishedBoard } from '../../board-studio/home/boards-store.ts';
import { Prof } from '../../components/Prof.tsx';
import { mainPath } from '../../derive/path.ts';
import {
  agentOf,
  askingAgent,
  handedNote,
  TOCA_SECTIONS,
  type TocaContext,
  type TocaSection,
  tocaSection,
} from '../../derive/toca.ts';
import { whenText } from '../../derive/when.ts';
import { language, type PlainKey, t, tx } from '../../i18n/i18n.ts';
import { Icon } from '../../kit/Icon.tsx';
import { AgentMark } from '../../kit/Marks.tsx';
import { laneOf } from '../../lanes/geometry.ts';
import type { Universe } from '../../lanes/handoff.ts';
import type { LaneBlock } from '../../lanes/LaneList.tsx';
import { lookOf } from '../../lanes/looks.ts';
import { actedWith } from '../../presence.ts';
import { stateWord } from '../../preset-words.ts';
import { roundsOf } from '../../rounds.ts';
import type { Item, TypeView } from '../../types.ts';
import { deliveryOf, evidenceWords, quietLine } from './phone.ts';
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
        sub: sub('toca.sub.asks', askingAgent(item, feed)),
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
      // On a board the next step's agent is whichever takes it, not the last one that acted.
      const who = ctx.onBoard?.(item) ? null : agentOf(item, feed);
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

// "1 sin respuesta" while notes wait for the agent's answer, else "claude-d contestó".
export function notesMark(notes: NonNullable<Item['notes']>): string | null {
  if (notes.unanswered > 0) return t('notes.unanswered', { count: notes.unanswered });
  return notes.replied ? t('toca.replied', { agent: notes.replied.by }) : null;
}

type TocaApp = Pick<App, 'all' | 'now' | 'feed' | 'collectionOf' | 'route'> &
  Partial<Pick<App, 'agents'>>;

function TocaRow({
  it,
  sec,
  app,
  ctx,
  phone = false,
}: {
  it: Item;
  sec: TocaSection;
  app: TocaApp;
  ctx: TocaContext;
  phone?: boolean;
}) {
  const when = whenText(it, app.now);
  const type = ctx.types(it);
  const call = rowCall(it, sec, ctx);
  const stuck = sec === 'atasco' && it.expiredLease;
  const round = stuck ? 0 : roundOf(it, app.feed, type);
  // On the phone a review says what the agent delivered: its note and how much evidence.
  const delivered = phone && sec === 'revisiones' ? deliveryOf(it, app.feed) : null;
  const files = delivered ? evidenceWords(delivered.images, delivered.files) : '';
  // The person's notes on the round: still waiting for the agent, or its latest answer, a light
  // mark that never changes whose turn it is.
  const mark = it.notes ? notesMark(it.notes) : null;
  // On the desk, the profile the agent acted with beside its name (agents mock §5).
  const who = call.sub.agent;
  const prof =
    who && !phone
      ? actedWith(
          who,
          app.feed.filter((e) => e.itemId === it.id),
          app.agents,
        )
      : null;
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
          {mark ? (
            <span className="mpt nt">
              <span className="sep">·</span>
              <span className="nt-mark">{mark}</span>
            </span>
          ) : null}
        </div>
        {delivered && (delivered.note || files) ? (
          <div className="p-said" data-leaf="">
            <AgentMark name={delivered.agent} />
            <span>
              {delivered.note ? <q>{delivered.note}</q> : null}
              {delivered.note && files ? ' · ' : null}
              {files}
            </span>
          </div>
        ) : null}
      </div>
      <div className={sec === 'atasco' ? 'a warn' : 'a'} data-leaf="">
        {call.act}
        <small>
          {call.sub.agent
            ? tx(call.sub.key as 'toca.sub.holds', { agent: <b>{call.sub.agent}</b> })
            : t(call.sub.key as 'toca.sub.yourTurn')}
          {prof ? (
            <>
              {' '}
              <span className="pw">
                · <Prof profile={prof} />
              </span>
            </>
          ) : null}
        </small>
      </div>
      <div className={when.warn ? 'age warn' : 'age'} data-leaf="" data-s={`${it.id}:when`}>
        {when.text}
      </div>
    </>
  );
}

// Your sections: on the phone, the empty ones join one line instead of each saying it is empty.
const YOURS: readonly TocaSection[] = ['atasco', 'preguntas', 'revisiones', 'propios'];

// phone (mobile mock 1): only what is yours on top, the empty ones in one italic line, En camino
// folded in one line until it is opened, no Cerrados.
export type TocaPhone = { encamino: boolean; onFold: () => void };

function FoldLine({ rows, ctx, o }: { rows: Item[]; ctx: TocaContext; o: TocaPhone }) {
  const first = rows[0];
  if (!first) return null;
  const who = agentOf(first, ctx.feed);
  return (
    <button
      type="button"
      className="p-fold"
      aria-expanded={o.encamino}
      onClick={(e) => {
        e.stopPropagation();
        o.onFold();
      }}
    >
      <span className="sum">
        {who ? <AgentMark name={who} decorative /> : null}
        {rows.length > 1
          ? t('phone.fold.more', { title: first.title, n: rows.length - 1 })
          : first.title}
      </span>
      <Icon name="chevron" />
    </button>
  );
}

export function tocaBlocks(
  app: TocaApp,
  atasco: boolean,
  o: { onTriage?: () => void; phone?: TocaPhone } = {},
): LaneBlock[] {
  const phone = atasco ? undefined : o.phone;
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
  const quiet: TocaSection[] = [];
  const quietBlock = () => {
    if (!quiet.length) return;
    blocks.push({ kind: 'empty', key: 'quiet', content: quietLine(quiet) });
    quiet.length = 0;
  };
  for (const sec of TOCA_SECTIONS) {
    if (atasco && sec !== 'atasco') continue;
    if (phone && sec === 'cerrados') continue;
    if (phone && YOURS.includes(sec) && !by.get(sec)?.length) {
      quiet.push(sec);
      continue;
    }
    if (phone && !YOURS.includes(sec)) quietBlock();
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
    if (phone && sec === 'encamino' && rows.length)
      blocks.push({
        kind: 'other',
        key: 'fold:encamino',
        className: 'p-foldb',
        content: <FoldLine rows={rows} ctx={ctx} o={phone} />,
      });
    const shown = phone && sec === 'encamino' && !phone.encamino ? [] : rows;
    for (const it of shown) {
      blocks.push({
        kind: 'row',
        key: it.id,
        lane: laneOf(it.turn),
        look: lookOf(it, app.now),
        sec,
        selected: app.route.item === it.id,
        content: <TocaRow it={it} sec={sec} app={app} ctx={ctx} phone={!!phone} />,
      });
    }
  }
  quietBlock();
  return blocks;
}
