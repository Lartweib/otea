import { Fragment, type KeyboardEvent, type ReactNode, useLayoutEffect, useRef } from 'react';
import type { FeedEvent } from '../../activity.ts';
import { agentOf, isStuck } from '../../derive/toca.ts';
import { whenText } from '../../derive/when.ts';
import { t } from '../../i18n/i18n.ts';
import { Count } from '../../kit/Count.tsx';
import { SeverityBars } from '../../kit/Marks.tsx';
import { laneOf } from '../../lanes/geometry.ts';
import { lookOf } from '../../lanes/looks.ts';
import type { CollectionView, Item } from '../../types.ts';
import { type Card, type PasosColumn, roundOf, severityOf } from './model.ts';
import { type CardSnap, pasosTransition, revealCols, snapCards } from './pasos-motion.ts';
import { since } from './rows.tsx';

// Pasos (SPEC §10.1, mock:399-425, 1606-1638): one column per step, a card per item with its
// coloured edge; children ride in their parent's card, on a small branch.

type PasosProps = {
  collection: CollectionView;
  columns: readonly PasosColumn[];
  cards: ReadonlyMap<string, Card[]>;
  now: number;
  feed: readonly FeedEvent[];
  selected: string | undefined;
  onOpen: (id: string) => void;
  // Trace the columns in as the view appears (not when the morph brings them).
  reveal: boolean;
  // The side a morph leaves.
  ghost?: boolean;
};

function WhoText({ item, feed }: { item: Item; feed: readonly FeedEvent[] }) {
  if (item.turn === 'human') {
    return (
      <span className="who you" data-s={`${item.id}:who`}>
        {t('boardView.who.you')}
      </span>
    );
  }
  const agent = agentOf(item, feed) ?? '';
  let suffix: ReactNode = null;
  if (item.turn === 'none') {
    return (
      <span className="who" data-s={`${item.id}:who`}>
        {item.closes === 'discarded' ? <i>{t('boardView.who.dropped')}</i> : agent}
      </span>
    );
  }
  if (!item.lease && !item.expiredLease) {
    const open = item.children?.open ?? 0;
    suffix = open > 0 ? t('boardView.waits', { count: open }) : t('boardView.queued');
  } else if (item.expiredLease && !item.lease) suffix = t('boardView.who.quiet');
  return (
    <span className="who" data-s={`${item.id}:who`}>
      {agent}
      {suffix ? <i> {suffix}</i> : null}
    </span>
  );
}

function Kids({ kids }: { kids: readonly Item[] }) {
  if (!kids.length) return null;
  const h = kids.length * 23.5;
  let d = '';
  kids.forEach((_, i) => {
    const y = 14 + i * 23.5;
    d += `M6.5 0 V${y - 7} Q6.5 ${y} 13.5 ${y} H16 `;
  });
  return (
    <div className="kids">
      <svg width="20" height={h} aria-hidden="true">
        <path d={d} fill="none" stroke="var(--rule-2)" strokeWidth="1" strokeLinecap="round" />
      </svg>
      {kids.map((k) => (
        <div key={k.id} className="kid">
          {k.title}
        </div>
      ))}
    </div>
  );
}

function CardView({
  card,
  p,
}: {
  card: Card;
  p: Pick<PasosProps, 'collection' | 'now' | 'feed' | 'selected' | 'onOpen'>;
}) {
  const it = card.item;
  const sev = severityOf(it, p.collection);
  const type = p.collection.types.find((ty) => ty.name === it.type) ?? p.collection.types[0];
  const round = roundOf(it, p.feed, type);
  const stuck = isStuck(it, p.now);
  const when = whenText(it, p.now);
  const meta: { k: string; node: ReactNode }[] = [];
  if (sev !== null) meta.push({ k: 'sev', node: <SeverityBars level={sev} /> });
  if (round > 1) meta.push({ k: 'round', node: <i>{t('boardView.round', { n: round })}</i> });
  if (stuck && it.expiredLease) {
    meta.push({
      k: 'quiet',
      node: (
        <span className="warn">
          {t('boardView.quietCard', { time: since(it.expiredLease.expiresAt, p.now) })}
        </span>
      ),
    });
  }
  meta.push({
    k: 'when',
    node: (
      <span className={when.warn ? 'warn' : undefined} data-s={`${it.id}:when`}>
        {when.text}
      </span>
    ),
  });
  const open = () => p.onOpen(it.id);
  const key = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    open();
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a card holds blocks of its own
    <div
      className={p.selected === it.id ? 'card sel' : 'card'}
      data-k={it.id}
      data-h={laneOf(it.turn)}
      data-look={lookOf(it, p.now)}
      data-leaf=""
      role="button"
      tabIndex={0}
      aria-current={p.selected === it.id ? 'true' : undefined}
      onClick={open}
      onKeyDown={key}
    >
      <i className="edge" data-s={`${it.id}:edge`} />
      <div className="ch">
        <span className="id" data-s={`${it.id}:id`}>
          {it.id}
        </span>
        <WhoText item={it} feed={p.feed} />
      </div>
      <div className="t">
        <span className="tt" data-s={`${it.id}:t`}>
          {it.title}
        </span>
      </div>
      <div className="cm">
        {meta.map((m, i) => (
          <Fragment key={m.k}>
            {i ? <span className="sep">·</span> : null}
            {m.node}
          </Fragment>
        ))}
      </div>
      <Kids kids={card.kids} />
    </div>
  );
}

// What a change of the cards is made of: when it differs, the cards carry.
const signature = (cards: ReadonlyMap<string, Card[]>, now: number) =>
  [...cards]
    .map(
      ([col, cs]) =>
        `${col}:${cs.map((c) => `${c.item.id}/${c.item.turn}/${lookOf(c.item, now)}/${c.kids.length}`).join(',')}`,
    )
    .join('|');

export function Pasos(p: PasosProps) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<{ sig: string; snap: CardSnap | null }>({ sig: '', snap: null });
  const sig = signature(p.cards, p.now);
  useLayoutEffect(() => {
    const cols = ref.current;
    if (!cols) return;
    const prev = last.current;
    if (prev.snap && prev.sig !== sig) {
      pasosTransition(cols, prev.snap).then(() => {
        if (ref.current) last.current.snap = snapCards(ref.current);
      });
    }
    last.current = { sig, snap: snapCards(cols) };
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: on mount only
  useLayoutEffect(() => {
    if (p.reveal && ref.current) revealCols(ref.current, 160);
  }, []);
  return (
    <div className={p.ghost ? 'cols mghost' : 'cols'} data-mode="pasos" ref={ref}>
      {p.columns.map((col, ci) => {
        const cs = p.cards.get(col.key) ?? [];
        const you = cs.some((c) => c.item.turn === 'human');
        return (
          <div key={col.key} className="col" data-col={ci}>
            <div className={you ? 'colh you' : 'colh'} data-leaf="">
              <h3>{col.label}</h3>
              <Count value={cs.length} {...(you ? { tone: 'you' as const } : {})} />
              <i className="rule" />
            </div>
            <div className="cards">
              {cs.map((card) => (
                <CardView key={card.item.id} card={card} p={p} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
