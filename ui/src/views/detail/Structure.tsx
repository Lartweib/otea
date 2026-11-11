import { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../../app/context.tsx';
import { t } from '../../i18n/i18n.ts';
import { AgentMark, Icon, Seg, useEscape } from '../../kit/index.ts';
import { lookOf } from '../../lanes/looks.ts';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { stateWordIn } from '../../preset-words.ts';
import { groupRelations } from '../../relations.ts';
import type { Item, ItemView, RelatedItem, RelationView } from '../../types.ts';

// Structure (SPEC §10.3, mock:596-629, 2722-2735, 3846-3897): the children with their progress and
// + child; the relations grouped by kind, as chips that swap the detail, × to unlink (the chip
// collapses), and «link» opening the well that searches every board.

const KINDS: readonly RelationView[] = ['relates', 'blocks', 'blocked_by', 'duplicates', 'parent'];
const KIND_LABEL: Record<string, Parameters<typeof t>[0]> = {
  relates: 'link.relates',
  blocks: 'link.blocks',
  blocked_by: 'link.blocked_by',
  duplicates: 'link.duplicates',
  parent: 'link.parent',
};

const short = (s: string) => (s.length > 34 ? `${s.slice(0, 33).trimEnd()}…` : s);

function relatedLook(r: RelatedItem, now: number) {
  return lookOf({ turn: r.turn, closes: r.closes, lease: r.lease } as unknown as Item, now);
}

function LinkWell({ item, onClose }: { item: ItemView; onClose: () => void }) {
  const app = useApp();
  const [kind, setKind] = useState<RelationView>('relates');
  const [q, setQ] = useState('');
  const el = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!reduced())
      el.current?.animate(
        [
          { clipPath: 'inset(0px 0px 100% 0px)', opacity: 0, transform: 'translateY(-8px)' },
          { clipPath: 'inset(0px 0px 0px 0px)', opacity: 1, transform: 'none' },
        ],
        { duration: 440, easing: C.settle },
      );
    const timer = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 120);
    return () => clearTimeout(timer);
  }, []);
  useEscape(true, 'link', onClose);
  const linked = new Set(item.relations.map((r) => r.id));
  const needle = q.trim().toLowerCase();
  const hits = app.all
    .filter(
      (x) =>
        x.id !== item.id &&
        !linked.has(x.id) &&
        (!needle || x.id.toLowerCase().includes(needle) || x.title.toLowerCase().includes(needle)),
    )
    .slice(0, 6);
  return (
    <div className="lwell" ref={el}>
      <div className="lrow">
        <Seg
          value={kind}
          options={KINDS.map((k) => ({ value: k, label: t(KIND_LABEL[k] as 'link.relates') }))}
          onChange={(v) => setKind(v)}
          label={t('link.kind')}
        />
      </div>
      <div className="lrow">
        <input
          ref={input}
          type="text"
          placeholder={t('sheet.link.placeholder')}
          aria-label={t('sheet.link.aria')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="lres" role="listbox" aria-label={t('link.matches')}>
        {hits.length === 0 ? <p className="none">{t('sheet.link.none')}</p> : null}
        {hits.map((x) => (
          <button
            key={x.id}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => {
              onClose();
              void app.link(item.id, kind, x.id);
            }}
          >
            <span className="id">{x.id}</span>
            <span>{x.title}</span>
            <small>{x.collection}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Structure({ item }: { item: ItemView }) {
  const app = useApp();
  const [well, setWell] = useState(false);
  const wellBox = useRef<HTMLDivElement>(null);
  const kids = item.relations.filter((r) => r.kind === 'child');
  const open = kids.filter((k) => k.turn !== 'none').length;
  const groups = groupRelations(
    item.relations.filter((r) => r.kind !== 'child' && r.kind !== 'parent'),
  );
  const nl = groups.reduce((n, g) => n + g.items.length, 0);
  const types = app.collections.flatMap((c) => c.types);
  const closeWell = () => {
    const w = wellBox.current?.firstElementChild;
    if (!w || reduced()) {
      setWell(false);
      return;
    }
    w.animate(
      [
        { clipPath: 'inset(0px 0px 0px 0px)', opacity: 1 },
        { clipPath: 'inset(0px 0px 100% 0px)', opacity: 0 },
      ],
      { duration: 440, easing: C.settle, fill: 'forwards' },
    ).finished.then(
      () => setWell(false),
      () => setWell(false),
    );
  };
  const unlink = (chip: HTMLElement | null, r: RelatedItem) => {
    const doit = () => void app.unlink(item.id, r);
    if (!chip || reduced()) return doit();
    const w = chip.offsetWidth;
    chip
      .animate(
        [
          { opacity: 1, maxWidth: `${w}px`, filter: 'blur(0px)' },
          {
            opacity: 0,
            maxWidth: '0px',
            filter: 'blur(1px)',
            paddingLeft: '0px',
            paddingRight: '0px',
          },
        ],
        { duration: 360, easing: C.settle, fill: 'forwards' },
      )
      .finished.then(doit, doit);
  };
  return (
    <section className="d-sec structure" data-key="structure">
      <div className="margin-label">{t('sheet.structure')}</div>
      <div>
        <div className="kidsbar">
          <span className="kc">
            {kids.length ? t('children.count', { count: kids.length }) : t('children.none')}
          </span>
          {kids.length ? (
            <>
              <span className="prog" aria-hidden="true">
                {[...kids]
                  .sort((a, b) => Number(a.turn === 'none') - Number(b.turn === 'none'))
                  .reverse()
                  .map((k) => (
                    <i
                      key={k.id}
                      className={k.turn === 'none' ? 'done' : k.turn === 'human' ? 'you' : 'ag'}
                    />
                  ))}
              </span>
              <span className="po">{t('children.open', { open, total: kids.length })}</span>
            </>
          ) : null}
          <span className="sp" />
          {app.session.canWrite ? (
            <button
              type="button"
              className="addbtn"
              onClick={() =>
                app.newItem({
                  parent: {
                    id: item.id,
                    title: item.title,
                    type: item.type,
                    collection: item.collection,
                  },
                })
              }
            >
              <Icon name="plus" />
              {t('children.add')}
            </button>
          ) : null}
        </div>
        {kids.length ? (
          <div className="krows">
            {kids.map((k) => (
              // biome-ignore lint/a11y/useSemanticElements: a row of the list that swaps the detail
              <div
                key={k.id}
                className="krow"
                role="button"
                tabIndex={0}
                onClick={() => app.openItem(k.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    app.openItem(k.id);
                  }
                }}
              >
                <NodeGlyph look={relatedLook(k, app.now)} size={16} />
                <span className="id">{k.id}</span>
                <span className="kt">{k.title}</span>
                <span className="ks">{stateWordIn(types, k.state)}</span>
                {k.turn === 'human' ? (
                  <AgentMark you decorative />
                ) : k.lease ? (
                  <AgentMark name={k.lease.holder} decorative />
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        ) : null}
        <div className="rels">
          <div className="rh">
            <span className="kc">
              {nl ? t('relations.count', { count: nl }) : t('relations.none')}
            </span>
            <span className="sp" />
            {app.session.canWrite ? (
              <button
                type="button"
                className="addbtn"
                aria-expanded={well}
                onClick={() => (well ? closeWell() : setWell(true))}
              >
                <Icon name="link" />
                {t('relations.link')}
              </button>
            ) : null}
          </div>
          {groups.map((g) => (
            <div key={g.kind} className="rgroup" data-kind={g.kind}>
              <div className="rk">{g.label}</div>
              <div className="rchips">
                {g.items.map((r) => (
                  <span key={r.id} className="rchip" data-chip={r.id}>
                    <button type="button" className="go" onClick={() => app.openItem(r.id)}>
                      <span className="id">{r.id}</span>
                      {short(r.title)}
                    </button>
                    {app.session.canWrite ? (
                      <button
                        type="button"
                        className="x"
                        aria-label={t('relations.remove', { id: r.id })}
                        onClick={(e) => unlink(e.currentTarget.closest('.rchip'), r)}
                      >
                        <Icon name="x" />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="lslot" ref={wellBox}>
            {well ? <LinkWell item={item} onClose={closeWell} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
