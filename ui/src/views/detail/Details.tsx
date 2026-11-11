import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { whenText } from '../../derive/when.ts';
import { momentLabel } from '../../format.ts';
import { externalUrl, gateRows } from '../../gates.ts';
import { t } from '../../i18n/i18n.ts';
import { TypeIcon } from '../../icons/TypeIcon.tsx';
import { detailBlocks, type PlacedValue, slotData } from '../../item-types.ts';
import { AgentMark, Icon, Swap } from '../../kit/index.ts';
import { moduleFor } from '../../modules/registry.ts';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { typeWord } from '../../preset-words.ts';
import type { ItemView, TypeView } from '../../types.ts';
import type { Facts } from './facts.ts';
import { DETAILS_SHOWN, moreOf } from './frame.ts';

// Details (SPEC §10.3, mock:2703-2720): who does it, who reviews, the lease, the type, the type's
// side fields, the board, who created it, when it changed, its parent, its gates. Stacked: an
// auto-fill grid between hairlines; aside: a list under the serif label, five then "N more", whose
// height glides as the rest resolve.

type Cell = {
  label: string;
  value: ReactNode;
  cls?: string;
  slot?: Record<string, string>;
  key?: string;
};

// Each cell keyed by its label, a repeated label by its place among its namesakes.
const keyed = (cells: Cell[]): (Cell & { key: string })[] => {
  const seen = new Map<string, number>();
  return cells.map((c) => {
    const n = seen.get(c.label) ?? 0;
    seen.set(c.label, n + 1);
    return { ...c, key: n ? `${c.label}#${n}` : c.label };
  });
};

function Value({ placed }: { placed: PlacedValue }) {
  const url = externalUrl(placed.value);
  if (placed.value === '') return <>—</>;
  if (url)
    return (
      <a className="detail-ext" href={url} target="_blank" rel="noreferrer noopener">
        {url.replace(/^https?:\/\//, '')}
        <Icon name="external" />
      </a>
    );
  const { Detail } = moduleFor(placed.field.module);
  return <Detail field={placed.field} value={placed.value} />;
}

export function detailCells(o: {
  item: ItemView;
  type: TypeView | undefined;
  facts: Facts;
  own: boolean;
  now: number;
}): (Cell & { key: string })[] {
  const { item, type, facts, now } = o;
  const you = t('sheet.d.you');
  const doer: Cell = o.own
    ? { label: t('sheet.d.doer'), value: you, cls: 'you' }
    : {
        label: t('sheet.d.doer'),
        value: facts.agent ? (
          <>
            <AgentMark name={facts.agent} decorative />
            {facts.agent}
          </>
        ) : (
          '—'
        ),
      };
  const left = whenText(item, now);
  const lease: Cell = {
    label: t('sheet.d.lease'),
    value: item.lease ? (
      left.warn ? (
        <span className="warn">{t('sheet.d.expired')}</span>
      ) : (
        `${item.lease.holder} · ${left.text}`
      )
    ) : item.expiredLease ? (
      <span className="warn">{t('sheet.d.expired')}</span>
    ) : (
      '—'
    ),
  };
  const { head, side } = detailBlocks(type, item.fields);
  const fields: Cell[] = [
    ...head,
    ...side.flatMap((b) => (b.kind === 'fields' ? b.values : [])),
  ].map((p) => ({ label: p.label, value: <Value placed={p} />, slot: slotData(p.at) }));
  const parent = item.relations.find((r) => r.kind === 'parent');
  const created = item.createdBy;
  const gates = gateRows(type, item.state, item.gates);
  return keyed([
    doer,
    { label: t('sheet.d.reviewer'), value: you, cls: 'you' },
    lease,
    {
      label: t('sheet.d.type'),
      value: (
        <>
          <TypeIcon name={type?.icon} size={14} />
          {typeWord(type, item.type)}
        </>
      ),
    },
    ...fields,
    { label: t('sheet.d.board'), value: item.collection },
    {
      label: t('sheet.d.createdBy'),
      value: created.kind === 'human' ? t('sheet.d.youLower') : created.name,
    },
    { label: t('sheet.d.updated'), value: momentLabel(item.updatedAt, now) },
    ...(parent
      ? [
          {
            label: t('sheet.d.parent'),
            value: (
              <a className="id" href={`#${encodeURIComponent(parent.id)}`}>
                {parent.id}
              </a>
            ),
          },
        ]
      : []),
    ...gates.map((g) => ({
      label: g.action,
      value: (
        <span className={g.allowed ? undefined : 'warn'}>
          {t(g.allowed ? 'gate.allowedShort' : 'gate.blockedShort')}
        </span>
      ),
    })),
  ]);
}

export function Details({ cells, k }: { cells: (Cell & { key: string })[]; k: string }) {
  const [all, setAll] = useState(false);
  const list = useRef<HTMLDListElement>(null);
  const h0 = useRef<number | null>(null);
  const more = moreOf(cells.length);
  useLayoutEffect(() => {
    const el = list.current;
    const from = h0.current;
    h0.current = null;
    if (!el || from == null || reduced()) return;
    const to = el.offsetHeight;
    el.animate(
      [
        { height: `${from}px`, overflow: 'hidden' },
        { height: `${to}px`, overflow: 'hidden' },
      ],
      {
        duration: 440,
        easing: C.settle,
      },
    );
    if (all)
      el.querySelectorAll(':scope > div.cut').forEach((c, i) => {
        c.animate(
          [
            { opacity: 0, transform: 'translateY(-4px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 380, delay: 80 + 34 * Math.min(i, 5), easing: C.glide, fill: 'backwards' },
        );
      });
  }, [all]);
  return (
    <div className="d-details" data-c>
      <div className="dlab">{t('sheet.d.title')}</div>
      <Swap k={k} as="div" dy={3}>
        <dl ref={list} className={all ? 'dlist all' : 'dlist'}>
          {cells.map((c, i) => (
            <div key={c.key} className={i >= DETAILS_SHOWN ? 'cut' : undefined} {...c.slot}>
              <dt>{c.label}</dt>
              <dd className={c.cls}>{c.value}</dd>
            </div>
          ))}
          {more > 0 ? (
            <button
              type="button"
              className="more-t"
              aria-expanded={all}
              onClick={() => {
                h0.current = list.current?.offsetHeight ?? null;
                setAll(!all);
              }}
            >
              {all ? t('sheet.d.fewer') : t('sheet.d.more', { count: more })}
            </button>
          ) : null}
        </dl>
      </Swap>
    </div>
  );
}
