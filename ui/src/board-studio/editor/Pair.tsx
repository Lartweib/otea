import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { type BoardDefinition, partOf } from '../../../../src/core/board/model.ts';
import { language, t, tx } from '../../i18n/i18n.ts';
import { Seg } from '../../kit/Seg.tsx';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import type { PairRole } from '../pair.ts';
import type { ReadyDraft } from '../use-board-draft.ts';
import { liveState } from './Bar.tsx';
import { useEditor } from './context.ts';
import { boardGlyph, Glyph } from './glyphs.tsx';
import { Route } from './Route.tsx';
import { geom } from './route-geometry.ts';
import { VRoute } from './VRoute.tsx';
import { whoWord } from './who.ts';

// A joined pair in one workspace (mock 78-pair.js): the bar's tab for each board with its state,
// both routes stacked with the "se divide en" line from the step that waits for the parts (or
// from Crear) to the child's label, the summary of the pair, and the two sections on a phone.

const ROLES: readonly PairRole[] = ['parent', 'child'];

// borrador / publicado · vN / cambios sin publicar.
export function stateWord(draft: ReadyDraft): { text: string; warm: boolean } {
  const { live, dirty } = liveState(draft);
  if (!live) return { text: t('bs.editor.pair.draft'), warm: true };
  if (dirty) return { text: t('bs.editor.pair.changed'), warm: true };
  return { text: t('bs.editor.pair.live', { v: live.version }), warm: false };
}

export function PairTabs() {
  const { pair, setOpenRow } = useEditor();
  if (!pair) return null;
  return (
    <Seg
      className="se-ptabs"
      label={t('bs.editor.pair.tabs')}
      value={pair.role}
      onChange={(role) => {
        setOpenRow(null);
        pair.switchTo(role);
      }}
      options={ROLES.map((role) => {
        const d = pair.drafts[role];
        const s = stateWord(d);
        return {
          value: role,
          label: (
            <>
              <span className="se-tn">{d.def.name.trim() || t('bs.editor.route.unnamed')}</span>
              <span className={s.warm ? 'se-ts you' : 'se-ts'}>
                <i />
                <span className="se-tw">{s.text}</span>
              </span>
            </>
          ),
        };
      })}
    />
  );
}

// The stop the "se divide en" line drops from: the step that waits for its parts, or Crear.
export function joinStop(def: BoardDefinition): string {
  return def.steps.find((s) => s.waits.includes('parts'))?.id ?? 'form';
}

function BoardName({ role }: { role: PairRole }) {
  const { pair, setOpenRow } = useEditor();
  if (!pair) return null;
  const d = pair.drafts[role].def;
  return (
    <button
      type="button"
      className="se-rbn"
      aria-pressed={pair.role === role}
      onClick={() => {
        setOpenRow(null);
        pair.switchTo(role);
      }}
    >
      <Glyph name={boardGlyph(d.icon)} />
      <span>{d.name.trim() || t('bs.editor.route.unnamed')}</span>
    </button>
  );
}

export function PairRoutes() {
  const { pair } = useEditor();
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(900);
  const [fit, setFit] = useState<'' | 'tight' | 'flip'>('');
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setW(Math.max(520, Math.round(el.offsetWidth || 900)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const parent = pair?.drafts.parent;
  const child = pair?.drafts.child;
  const key = parent ? joinStop(parent.def) : 'form';
  const drop = parent ? geom(parent.def, W).stops.find((s) => s.key === key) : undefined;
  const dropX = drop?.x ?? 64;

  // The hanger fits under the stop; when it would run off the right edge it drops "cada ítem"
  // first, then ends at the line instead of starting there.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again on each new layout
  useLayoutEffect(() => {
    setFit('');
  }, [W, dropX, child?.def.name, child?.def.item]);
  const drawn = useRef(false);
  useLayoutEffect(() => {
    const w = wrap.current;
    const line = svg.current;
    if (!w || !line || !parent || !child) return;
    const hang = w.querySelector<HTMLElement>('.se-rbh.hang');
    const btn = w.querySelector<HTMLElement>(
      `.se-stopbtn[data-board="${CSS.escape(parent.record.id)}"][data-key="${CSS.escape(key)}"]`,
    );
    if (!hang || !btn) return;
    const wr = w.getBoundingClientRect();
    const last = hang.lastElementChild?.getBoundingClientRect();
    if (last && last.right > wr.right - 4 && fit !== 'flip') {
      setFit(fit === '' ? 'tight' : 'flip');
      return;
    }
    const br = btn.getBoundingClientRect();
    const hr = hang.getBoundingClientRect();
    const x = Math.round(br.left + br.width / 2 - wr.left) + 0.5;
    const step = parent.def.steps.find((s) => s.id === key);
    const y0 = br.top + br.height / 2 - wr.top + (step ? (step.doer === 'you' ? 12 : 30) : 10);
    const y1 = hr.top - wr.top + hr.height / 2 - 0.5;
    line.setAttribute('width', String(w.offsetWidth));
    line.setAttribute('height', String(w.offsetHeight));
    const path = line.querySelector('path');
    const dot = line.querySelector('circle');
    path?.setAttribute('d', `M${x} ${y0}V${y1}`);
    dot?.setAttribute('cx', String(x));
    dot?.setAttribute('cy', String(y1));
    if (!drawn.current && path && !reduced())
      path.animate(
        [
          { strokeDasharray: '1 1', strokeDashoffset: 1 },
          { strokeDasharray: '1 1', strokeDashoffset: 0 },
        ],
        { duration: 640, delay: 240, easing: C.ink, fill: 'backwards' },
      );
    drawn.current = true;
  });

  // The routes trade emphasis when the board on screen changes.
  const was = useRef(pair?.role);
  useLayoutEffect(() => {
    const w = wrap.current;
    if (!w || !pair || was.current === pair.role) return;
    const prev = was.current;
    was.current = pair.role;
    if (reduced() || !prev) return;
    for (const role of ROLES) {
      const rr = w.querySelector<HTMLElement>(`[data-rb="${role}"] .se-rroute`);
      rr?.animate(
        [{ opacity: role === prev ? 1 : 0.5 }, { opacity: role === pair.role ? 1 : 0.5 }],
        {
          duration: 420,
          easing: C.drift,
        },
      );
    }
  });

  if (!pair || !parent || !child) return null;
  return (
    <div className="se-pairroutes" ref={wrap}>
      {ROLES.map((role) => {
        const d = pair.drafts[role];
        const on = pair.role === role;
        const meta = (
          <span className="se-rbg">{t('bs.editor.pair.each', { item: d.def.item })}</span>
        );
        return (
          <div key={role} className={on ? 'se-rblock on' : 'se-rblock'} data-rb={role}>
            {role === 'child' ? (
              <div
                className={['se-rbh', 'hang', fit === 'flip' ? 'tight flip' : fit]
                  .filter(Boolean)
                  .join(' ')}
                style={{ '--hx': `${Math.round(dropX)}px` } as React.CSSProperties}
              >
                <em className="se-rbj">{t('bs.editor.pair.divides')}</em>
                <BoardName role={role} />
                {meta}
              </div>
            ) : (
              <div className="se-rbh">
                <BoardName role={role} />
                {meta}
              </div>
            )}
            <div className="se-rroute">
              <Route board={d} role={role} dropX={role === 'parent' ? dropX : null} />
            </div>
          </div>
        );
      })}
      <svg className="se-rjoin" ref={svg} aria-hidden="true">
        <path pathLength={1} fill="none" stroke="var(--ink-3)" strokeWidth="1" />
        <circle r="2.6" fill="var(--ink-3)" />
      </svg>
    </div>
  );
}

// On a phone: each board's stops in its own section, "se divide en" between them.
export function VPair() {
  const { pair } = useEditor();
  if (!pair) return null;
  return (
    <div className="se-vroute se-vpair">
      {ROLES.map((role) => {
        const d = pair.drafts[role];
        const s = stateWord(d);
        const on = pair.role === role;
        return (
          <div key={role} className={on ? 'se-vsec on' : 'se-vsec'} data-vb={role}>
            <div className={role === 'child' ? 'se-vbh child' : 'se-vbh'}>
              {role === 'child' ? <em className="se-rbj">{t('bs.editor.pair.divides')}</em> : null}
              <BoardName role={role} />
              <span className={s.warm ? 'se-rbs you' : 'se-rbs'}>{s.text}</span>
            </div>
            <VRoute board={d} role={role} />
          </div>
        );
      })}
    </div>
  );
}

// ---- the summary of the pair: the parent in one sentence, the join, the child ----

const lower = (s: string) => (s ? (s[0]?.toLocaleLowerCase(language()) ?? '') + s.slice(1) : s);

function whoShort(who: BoardDefinition['steps'][number]['doer']): string {
  return who === 'any' ? t('bs.editor.an_agent') : whoWord(who);
}

// "A, B y C" with each name bold and what follows it plain.
function boldList(items: readonly { name: string; after?: string }[], join: 'and' | 'or' = 'and') {
  const parts = new Intl.ListFormat(language(), {
    type: join === 'and' ? 'conjunction' : 'disjunction',
  }).formatToParts(items.map((_, i) => `\u0000${i}`));
  return parts.map((p, i) => {
    // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one list never move
    if (p.type !== 'element') return <Fragment key={i}>{p.value}</Fragment>;
    const item = items[Number(p.value.slice(1))];
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one list never move
      <Fragment key={i}>
        <b>{item?.name}</b>
        {item?.after ? ` ${item.after}` : ''}
      </Fragment>
    );
  });
}

function boardSentence(def: BoardDefinition) {
  const item = lower(def.item.trim() || t('bs.editor.item'));
  const form = [def.title, ...def.form.map((f) => partOf(def, f.ref)?.name ?? '')].filter(Boolean);
  if (!def.steps.length)
    return tx('bs.editor.pair.sum_none', { item, form: boldList(form.map((name) => ({ name }))) });
  return tx('bs.editor.pair.sum', {
    item,
    form: boldList(form.map((name) => ({ name }))),
    steps: boldList(
      def.steps.map((s) => ({
        name: s.name.trim() || t('bs.editor.unnamed'),
        after: `(${whoShort(s.doer)})`,
      })),
    ),
    done: <b>{t('bs.done')}</b>,
  });
}

export function PairDek() {
  const { pair, setOpenRow } = useEditor();
  if (!pair) return null;
  const pd = pair.drafts.parent.def;
  const cd = pair.drafts.child.def;
  const waiting = pd.steps.filter((s) => s.waits.includes('parts'));
  const item = lower(pd.item.trim() || t('bs.editor.item'));
  const part = lower(cd.item.trim() || t('bs.editor.item'));
  const sentence = (role: PairRole, def: BoardDefinition) => (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the tabs and the route names switch too
    // biome-ignore lint/a11y/noStaticElementInteractions: a sentence that also switches board
    <span
      className={pair.role === role ? 'se-dkp on' : 'se-dkp'}
      onClick={() => {
        if (pair.role === role) return;
        setOpenRow(null);
        pair.switchTo(role);
      }}
    >
      {boardSentence(def)}
    </span>
  );
  return (
    <div className="dek se-dek se-pairdek">
      {sentence('parent', pd)}
      <span className="se-dkj">
        <i aria-hidden="true" />
        {tx(pd.split?.always ? 'bs.editor.pair.join_always' : 'bs.editor.pair.join', {
          item,
          part,
          board: <b>{cd.name}</b>,
        })}
        {waiting.length ? ` ${''}` : null}
        {waiting.length
          ? tx('bs.editor.pair.join_waits', {
              steps: boldList(waiting.map((s) => ({ name: s.name }))),
              count: waiting.length,
            })
          : null}
      </span>
      {sentence('child', cd)}
    </div>
  );
}
