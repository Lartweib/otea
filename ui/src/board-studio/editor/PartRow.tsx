import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { startsWith } from '../../../../src/core/board/engine.ts';
import {
  CHOICE_KINDS,
  EVIDENCE_SHOWS,
  type EvidenceKind,
  type FieldKind,
  type Hand,
  isEvidenceKind,
  LEVELS,
  type Part,
  partOf,
  type Requirement,
  type Step,
  TITLE,
  WHEN_KINDS,
} from '../../../../src/core/board/model.ts';
import { type PlainKey, t, tx } from '../../i18n/i18n.ts';
import { ChipButton } from '../../kit/Button.tsx';
import { toast } from '../../kit/pop/toast.tsx';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { kindName } from '../words.ts';
import { useEditor } from './context.ts';
import { FieldExtras } from './cover.tsx';
import {
  addChoice,
  type PartPlace,
  removeChoice,
  removePart,
  renamePart,
  setFormRequired,
  setFresh,
  setHint,
  setRequirement,
  setShow,
  setTitleName,
  setWhen,
} from './edits.ts';
import { Chev, Glyph, kindGlyph } from './glyphs.tsx';
import { Conseq } from './SentenceText.tsx';
import { handConseq, whenValueName } from './sentences.ts';

// One thing a list asks for (mock handRow, partEditor): its kind's mark, its name, what goes there,
// and whether it is required; pressed, it unrolls its editor in place, and rolls back up the same
// way. Every setting says what it means right under it.

export type RowEntry =
  | { at: { type: 'step'; step: string }; hand: Hand }
  | { at: { type: 'form' }; ref: string; required: boolean }
  | { at: { type: 'anytime' }; ref: string };

const refOf = (e: RowEntry) => ('hand' in e ? e.hand.ref : e.ref);

function reqLabel(e: RowEntry): { text: string; on: boolean } {
  if (e.at.type === 'form') {
    const required = 'required' in e ? e.required : true;
    return { text: t(required ? 'bs.editor.req.always' : 'bs.editor.req.no'), on: required };
  }
  if (e.at.type === 'anytime') return { text: t('bs.editor.req.any'), on: false };
  const hand = (e as { hand: Hand }).hand;
  if (hand.req === 'always')
    return {
      text: t(hand.fresh ? 'bs.editor.req.always_fresh' : 'bs.editor.req.always'),
      on: true,
    };
  return {
    text: t(hand.req === 'when' ? 'bs.editor.req.when' : 'bs.editor.req.no'),
    on: hand.req === 'when',
  };
}

const showWord = (show: string) => t(`bs.show.${show}` as PlainKey);

// The editor unrolls from its top edge and rolls back up the same way (MOTION: a close is the open
// mirrored).
export function Unroll({ open, children }: { open: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(open);
  const box = useRef<HTMLDivElement>(null);
  if (open && !shown) setShown(true);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (reduced()) {
      if (!open) setShown(false);
      return;
    }
    for (const a of el.getAnimations()) a.cancel();
    const h = el.scrollHeight;
    if (open) {
      el.animate(
        [
          { clipPath: 'inset(0 0 100% 0)', height: '0px' },
          { clipPath: 'inset(0 0 0% 0)', height: `${h}px` },
        ],
        { duration: 440, easing: C.settle },
      );
      for (const [i, c] of [
        ...el.querySelectorAll<HTMLElement>(':scope > .se-hedit-in > *'),
      ].entries())
        c.animate(
          [
            { opacity: 0, transform: 'translateY(-3px)' },
            { opacity: 1, transform: 'none' },
          ],
          {
            duration: 340,
            delay: 80 + 30 * Math.min(i, 8),
            easing: C.glide,
            fill: 'backwards',
          },
        );
    } else {
      // The open run backwards: the last piece leaves first, then the surface rolls up.
      const kids = [...el.querySelectorAll<HTMLElement>(':scope > .se-hedit-in > *')].reverse();
      for (const [i, c] of kids.entries())
        c.animate(
          [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'translateY(-3px)' },
          ],
          {
            duration: 300,
            delay: 24 * Math.min(i, 8),
            easing: C.glide,
            fill: 'forwards',
          },
        );
      const a = el.animate(
        [
          { clipPath: 'inset(0 0 0% 0)', height: `${h}px` },
          { clipPath: 'inset(0 0 100% 0)', height: '0px' },
        ],
        { duration: 440, easing: C.settle, fill: 'forwards' },
      );
      a.finished.then(
        () => setShown(false),
        () => undefined,
      );
    }
  }, [open]);
  if (!shown) return null;
  return (
    <div className="se-hedit" ref={box}>
      <div className="se-hedit-in">{children}</div>
    </div>
  );
}

export function PartRow({ entry }: { entry: RowEntry }) {
  const { draft, openRow, setOpenRow } = useEditor();
  const def = draft.def;
  const ref = refOf(entry);
  const part = partOf(def, ref);
  if (!part) return null;
  const open = openRow === ref;
  const req = reqLabel(entry);
  const shows = isEvidenceKind(part.kind) ? EVIDENCE_SHOWS[part.kind as EvidenceKind] : undefined;
  const kindLine = [
    kindName(part.kind) + (shows && part.show ? ` ${showWord(part.show)}` : ''),
    part.hint,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={open ? 'se-hrow open' : 'se-hrow'} data-row={ref}>
      <button
        type="button"
        className="se-hh"
        aria-expanded={open}
        onClick={() => {
          draft.endBurst();
          setOpenRow(open ? null : ref);
        }}
      >
        <span className="se-hic">
          <Glyph name={kindGlyph(part.kind)} />
        </span>
        <span className="se-hmain">
          <span className="se-hn">{part.name.trim() || t('bs.editor.route.unnamed')}</span>
          <span className="se-hk">{kindLine}</span>
        </span>
        <span className={req.on ? 'se-req on' : 'se-req'}>{req.text}</span>
        <Chev />
      </button>
      <Unroll open={open}>
        <PartEditor entry={entry} part={part} />
      </Unroll>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label className="se-fld">
      <span className="se-flab">{label}</span>
      {children}
    </label>
  );
}

function PartEditor({ entry, part }: { entry: RowEntry; part: Part }) {
  const { draft, setOpenRow } = useEditor();
  const def = draft.def;
  const ref = part.id;
  const out: ReactNode[] = [];
  const end = () => draft.endBurst();

  if (ref === TITLE) {
    out.push(
      <Field key="name" label={t('bs.editor.part.name')}>
        <input
          className="se-tx"
          data-name=""
          value={def.title}
          maxLength={32}
          onChange={(e) => draft.mutate((d) => setTitleName(d, e.target.value), 'title')}
          onBlur={end}
        />
      </Field>,
      <p key="note" className="se-conseq">
        {t('bs.editor.part.title_note')}
      </p>,
    );
    return <>{out}</>;
  }

  out.push(
    <div key="names" className="se-hgrid">
      <Field label={t('bs.editor.part.name')}>
        <input
          className="se-tx"
          data-name=""
          value={part.name}
          maxLength={32}
          onChange={(e) => draft.mutate((d) => renamePart(d, ref, e.target.value), `pname:${ref}`)}
          onBlur={end}
        />
      </Field>
      <Field label={t('bs.editor.part.hint')}>
        <input
          className="se-tx"
          value={part.hint}
          maxLength={80}
          placeholder={t('bs.editor.part.hint_ph')}
          onChange={(e) => draft.mutate((d) => setHint(d, ref, e.target.value), `phint:${ref}`)}
          onBlur={end}
        />
      </Field>
    </div>,
  );

  if (CHOICE_KINDS.includes(part.kind as FieldKind))
    out.push(<Choices key="choices" part={part} />);

  const shows = isEvidenceKind(part.kind) ? EVIDENCE_SHOWS[part.kind as EvidenceKind] : undefined;
  if (shows)
    out.push(
      <div key="show">
        <span className="se-flab">{t('bs.editor.part.show')}</span>
        <div className="se-radios">
          {shows.map((v) => (
            <ChipButton
              key={v}
              on={(part.show ?? shows[0]) === v}
              onClick={() => draft.mutate((d) => setShow(d, ref, v))}
            >
              {showWord(v)}
            </ChipButton>
          ))}
        </div>
      </div>,
    );

  out.push(<FieldExtras key="extras" part={part} />);

  if (entry.at.type === 'step' && 'hand' in entry) {
    const stepId = entry.at.step;
    const step = def.steps.find((s) => s.id === stepId);
    if (step) out.push(...handSettings(step, entry.hand, part));
  }

  if (entry.at.type === 'form' && 'required' in entry) {
    const required = entry.required;
    out.push(
      <div key="formreq">
        <span className="se-flab">{t('bs.editor.part.form_needed')}</span>
        <div className="se-radios">
          <ChipButton
            on={required}
            onClick={() => draft.mutate((d) => setFormRequired(d, ref, true))}
          >
            {t('bs.editor.part.yes')}
          </ChipButton>
          <ChipButton
            on={!required}
            onClick={() => draft.mutate((d) => setFormRequired(d, ref, false))}
          >
            {t('bs.editor.part.no_short')}
          </ChipButton>
        </div>
      </div>,
      <p key="formconseq" className="se-conseq">
        {required
          ? tx('bs.editor.part.form_yes', { part: <b>{part.name}</b> })
          : t('bs.editor.part.form_no')}
      </p>,
    );
  }

  const at: PartPlace = entry.at;
  const where =
    at.type === 'step'
      ? (def.steps.find((s) => s.id === at.step)?.name ?? '')
      : at.type === 'form'
        ? t('bs.editor.toast.from_form')
        : t('bs.editor.toast.from_any');
  out.push(
    <div key="foot" className="se-hfoot">
      <button
        type="button"
        className="btn text sm se-warnbtn"
        onClick={() => {
          setOpenRow(null);
          draft.mutate((d) => removePart(d, at, ref));
          toast({
            msg: tx('bs.editor.toast.part_removed', {
              part: <b>{part.name}</b>,
              where: at.type === 'step' ? <b>{where}</b> : where,
            }),
            undo: draft.undo,
          });
        }}
      >
        {t(
          at.type === 'step'
            ? 'bs.editor.part.remove_step'
            : at.type === 'form'
              ? 'bs.editor.part.remove_form'
              : 'bs.editor.part.remove_any',
        )}
      </button>
    </div>,
  );
  return <>{out}</>;

  function handSettings(step: Step, hand: Hand, p: Part): ReactNode[] {
    const nodes: ReactNode[] = [];
    const set = (req: Requirement) => draft.mutate((d) => setRequirement(d, step.id, ref, req));
    nodes.push(
      <div key="req">
        <span className="se-flab">{t('bs.editor.part.needed')}</span>
        <div className="se-radios">
          <ChipButton on={hand.req === 'always'} onClick={() => set('always')}>
            {t('bs.editor.part.always')}
          </ChipButton>
          <ChipButton on={hand.req === 'when'} onClick={() => set('when')}>
            {t('bs.editor.part.when')}
          </ChipButton>
          <ChipButton on={hand.req === 'no'} onClick={() => set('no')}>
            {t('bs.editor.part.no')}
          </ChipButton>
          {isEvidenceKind(p.kind) ? (
            <ChipButton
              className="you"
              on={hand.fresh}
              disabled={hand.req === 'no'}
              onClick={() => draft.mutate((d) => setFresh(d, step.id, ref, !hand.fresh))}
            >
              {t('bs.editor.part.fresh')}
            </ChipButton>
          ) : null}
        </div>
      </div>,
    );
    if (hand.req === 'when') {
      const seen = new Set<string>();
      const candidates = [...startsWith(def, step.id).map((o) => o.ref), ...def.anytime]
        .filter((r) => {
          if (seen.has(r)) return false;
          seen.add(r);
          return true;
        })
        .map((r) => partOf(def, r))
        .filter((c): c is Part => !!c && WHEN_KINDS.includes(c.kind as FieldKind));
      if (!candidates.length)
        nodes.push(
          <p key="whennone" className="se-conseq warn">
            {t('bs.editor.part.when_none')}
          </p>,
        );
      else {
        const on = hand.when ? partOf(def, hand.when.part) : undefined;
        const values: { id: string; name: string }[] = !on
          ? []
          : on.kind === 'level'
            ? LEVELS.map((l) => ({ id: l, name: whenValueName(def, on.id, l) }))
            : on.kind === 'yesno'
              ? ['yes', 'no'].map((v) => ({ id: v, name: whenValueName(def, on.id, v) }))
              : on.options.map((c) => ({ id: c.id, name: c.name }));
        nodes.push(
          <div key="when" className="se-hgrid">
            <Field label={t('bs.editor.part.when_on')}>
              <select
                className="se-tx"
                value={on?.id ?? ''}
                onChange={(e) => {
                  const pick = partOf(def, e.target.value);
                  if (!pick) return;
                  const first =
                    pick.kind === 'level'
                      ? LEVELS[0]
                      : pick.kind === 'yesno'
                        ? 'yes'
                        : (pick.options[0]?.id ?? '');
                  draft.mutate((d) => setWhen(d, step.id, ref, { part: pick.id, value: first }));
                }}
              >
                <option value="">{t('bs.editor.part.when_pick')}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('bs.editor.part.when_is')}>
              <select
                className="se-tx"
                disabled={!on}
                value={hand.when?.value ?? ''}
                onChange={(e) =>
                  on &&
                  draft.mutate((d) =>
                    setWhen(d, step.id, ref, { part: on.id, value: e.target.value }),
                  )
                }
              >
                {values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>,
        );
      }
    }
    nodes.push(
      <div key="conseq" data-hc={ref}>
        {handConseq(def, step, hand).map((s) => (
          <Conseq key={s.key} s={s} />
        ))}
      </div>,
    );
    return nodes;
  }
}

// The choices as chips, each with its ×, and «+ añadir y Enter» at the end.
function Choices({ part }: { part: Part }) {
  const { draft } = useEditor();
  const [typed, setTyped] = useState('');
  return (
    <div>
      <span className="se-flab">
        {part.kind === 'check' ? t('bs.editor.part.boxes') : t('bs.editor.part.options')}
      </span>
      <div className="se-opts">
        {part.options.map((c) => (
          <span key={c.id} className="se-opt">
            {c.name}
            <button
              type="button"
              aria-label={t('bs.editor.part.option_remove', { name: c.name })}
              onClick={() => draft.mutate((d) => removeChoice(d, part.id, c.id))}
            >
              <Glyph name="x" />
            </button>
          </span>
        ))}
        <input
          value={typed}
          placeholder={t('bs.editor.part.option_ph')}
          aria-label={t('bs.editor.part.option_add')}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const name = typed.trim();
            if (!name) return;
            draft.mutate((d) => addChoice(d, part.id, name));
            setTyped('');
          }}
        />
      </div>
    </div>
  );
}
