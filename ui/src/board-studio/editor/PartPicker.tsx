import { useLayoutEffect, useRef, useState } from 'react';
import {
  CHOICE_KINDS,
  EVIDENCE_KINDS,
  FIELD_KINDS,
  type FieldKind,
  type PartKind,
  type Wait,
} from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { kindGloss, kindName } from '../words.ts';
import { useEditor } from './context.ts';
import { partsLabel } from './cover.tsx';
import { addNote, addPart, addWait, hasNote, type PartPlace, reusePart } from './edits.ts';
import { Glyph, kindGlyph } from './glyphs.tsx';
import { splitInfo } from './joined.ts';
import { EdPop, placeBy, useAnchor } from './menus.tsx';

// «+ Añadir a la entrega» (mock partPicker): first what kind of thing, then which. The pop swaps
// its content in place and its surface grows to the new size on the settle curve.

type Stage = 'q' | 'field' | 'evidence' | 'reuse' | 'wait';

const QUESTION = {
  step: 'bs.editor.pick.q_step',
  form: 'bs.editor.pick.q_form',
  anytime: 'bs.editor.pick.q_any',
} as const;

export function AddPart({ at, label }: { at: PartPlace; label: string }) {
  const { draft, setOpenRow, boards } = useEditor();
  const def = draft.def;
  const pop = useAnchor();
  const step = at.type === 'step' ? def.steps.find((s) => s.id === at.step) : undefined;
  const split = splitInfo(def, boards, draft.record.id);
  const [stage, setStage] = useState<Stage>('q');
  const body = useRef<HTMLDivElement>(null);
  const was = useRef<{ stage: Stage; h: number } | null>(null);

  const here = new Set(
    at.type === 'step'
      ? (def.steps.find((s) => s.id === at.step)?.hand.map((h) => h.ref) ?? [])
      : at.type === 'form'
        ? def.form.map((f) => f.ref)
        : def.anytime,
  );
  const reusable = Object.values(def.parts).filter((p) => !here.has(p.id) && p.name.trim());

  // A new stage: the surface grows from its old height, the new choices resolve one by one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on a change of stage only
  useLayoutEffect(() => {
    const el = body.current;
    const surf = el?.closest<HTMLElement>('.psurf');
    if (!el || !surf) return;
    const prev = was.current;
    const host = el.closest<HTMLElement>('.pop');
    if (prev && prev.stage !== stage && host && pop.anchor)
      placeBy(host, pop.anchor, host.classList.contains('e-bottom') ? 'bottom' : 'top');
    const h1 = surf.offsetHeight;
    was.current = { stage, h: h1 };
    if (!prev || prev.stage === stage || reduced()) return;
    surf.animate([{ height: `${prev.h}px` }, { height: `${h1}px` }], {
      duration: 420,
      easing: C.settle,
    });
    for (const [i, x] of [...el.querySelectorAll<HTMLElement>('[data-sw]')].entries())
      x.animate(
        [
          { opacity: 0, transform: 'translateY(-3px)', filter: 'blur(1px)' },
          { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        ],
        { duration: 320, delay: 40 + 24 * Math.min(i, 8), easing: C.glide, fill: 'backwards' },
      );
  }, [stage]);

  const done = (ref: string) => {
    pop.close();
    setOpenRow(ref);
    window.setTimeout(() => {
      const name = document.querySelector<HTMLInputElement>(
        `.se-hrow[data-row="${ref}"] input[data-name]`,
      );
      if (!name) return;
      name.focus({ preventScroll: true });
      name.select();
      name.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    }, 220);
  };
  const create = (kind: PartKind) => {
    let ref = '';
    const choices = CHOICE_KINDS.includes(kind as FieldKind);
    const options = !choices
      ? []
      : kind === 'check'
        ? [t('bs.editor.opt.first'), t('bs.editor.opt.then')]
        : [t('bs.editor.opt.one'), t('bs.editor.opt.other')];
    draft.endBurst();
    draft.mutate((d) => {
      ref = addPart(d, at, kind, { name: kindName(kind), options });
    });
    if (ref) done(ref);
  };
  const reuse = (ref: string) => {
    draft.endBurst();
    draft.mutate((d) => reusePart(d, at, ref));
    done(ref);
  };
  const opened = (row: string) => {
    pop.close();
    setOpenRow(row);
  };
  const wait = (w: Wait) => {
    if (!step) return;
    draft.endBurst();
    draft.mutate((d) => addWait(d, step.id, w));
    opened(`wait:${w}`);
  };
  const note = () => {
    if (!step) return;
    draft.endBurst();
    draft.mutate((d) => addNote(d, step.id, t('bs.editor.note.default_hint')));
    opened('note');
  };

  const back = (
    <p className="se-kback" data-sw="">
      <button type="button" data-i="" onClick={() => setStage('q')}>
        {t('bs.editor.pick.back')}
      </button>
      <span>
        {stage === 'field'
          ? t('bs.editor.pick.field_stage')
          : stage === 'evidence'
            ? t('bs.editor.pick.evidence_stage')
            : stage === 'wait'
              ? t('bs.editor.pick.wait_stage')
              : t('bs.editor.pick.reuse_stage')}
      </span>
    </p>
  );
  const kinds = (list: readonly PartKind[]) => (
    <div className="se-kgrid">
      {list.map((k) => (
        <button
          key={k}
          type="button"
          className="mi se-mi"
          data-i=""
          data-sw=""
          onClick={() => create(k)}
        >
          <Glyph name={kindGlyph(k)} />
          <span className="se-lbx">
            {kindName(k)}
            <span className="se-gl2">{kindGloss(k)}</span>
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="se-addbtn"
        aria-haspopup="menu"
        aria-expanded={pop.open}
        onClick={(e) => {
          setStage('q');
          was.current = null;
          pop.toggle(e.currentTarget);
        }}
      >
        <Glyph name="plus" />
        {label}
      </button>
      <EdPop
        open={pop.open}
        anchor={pop.anchor}
        estimate={430}
        onClose={pop.close}
        label={t('bs.editor.pick.label')}
        className="se-picker"
      >
        <div className="se-kinds" ref={body}>
          {stage === 'q' ? (
            <>
              <p className="plabel" data-i="" data-sw="">
                {t(QUESTION[at.type])}
              </p>
              <div className={step ? 'se-kq four' : 'se-kq'}>
                <button type="button" data-i="" data-sw="" onClick={() => setStage('field')}>
                  <b>
                    <Glyph name="text" />
                    {t('bs.editor.pick.field')}
                  </b>
                  <span>{t('bs.editor.pick.field_gloss')}</span>
                </button>
                <button type="button" data-i="" data-sw="" onClick={() => setStage('evidence')}>
                  <b>
                    <Glyph name="images" />
                    {t('bs.editor.pick.evidence')}
                  </b>
                  <span>{t('bs.editor.pick.evidence_gloss')}</span>
                </button>
                <button
                  type="button"
                  data-i=""
                  data-sw=""
                  disabled={!reusable.length}
                  onClick={() => setStage('reuse')}
                >
                  <b>
                    <Glyph name="check_k" />
                    {t('bs.editor.pick.reuse')}
                  </b>
                  <span>
                    {reusable.length
                      ? t('bs.editor.pick.reuse_gloss')
                      : t('bs.editor.pick.reuse_none')}
                  </span>
                </button>
                {step ? (
                  <button type="button" data-i="" data-sw="" onClick={() => setStage('wait')}>
                    <b>
                      <Glyph name="wait" />
                      {t('bs.editor.pick.wait')}
                    </b>
                    <span>{t('bs.editor.pick.wait_gloss')}</span>
                  </button>
                ) : null}
              </div>
            </>
          ) : stage === 'wait' && step ? (
            <>
              {back}
              <div className="se-kgrid one">
                <button
                  type="button"
                  className="mi se-mi"
                  data-i=""
                  data-sw=""
                  disabled={step.waits.includes('parts') || !split}
                  onClick={() => wait('parts')}
                >
                  <Glyph name="parts" />
                  <span className="se-lbx">
                    {t('bs.editor.pick.wait_parts')}
                    <span className="se-gl2">
                      {step.waits.includes('parts')
                        ? t('bs.editor.pick.wait_has')
                        : split
                          ? t('bs.editor.wait.parts_sent', {
                              board: partsLabel(def, boards, draft.record.id),
                            })
                          : t('bs.editor.pick.wait_no_split', { item: def.item })}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="mi se-mi"
                  data-i=""
                  data-sw=""
                  disabled={step.waits.includes('blockers')}
                  onClick={() => wait('blockers')}
                >
                  <Glyph name="wait" />
                  <span className="se-lbx">
                    {t('bs.editor.pick.wait_blockers')}
                    <span className="se-gl2">
                      {step.waits.includes('blockers')
                        ? t('bs.editor.pick.wait_has')
                        : t('bs.editor.wait.blockers_sent')}
                    </span>
                  </span>
                </button>
              </div>
              <p className="pnote" data-sw="">
                {t('bs.editor.wait.approve')}
              </p>
            </>
          ) : stage === 'reuse' ? (
            <>
              {back}
              <div className="se-kgrid">
                {reusable.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="mi se-mi"
                    data-i=""
                    data-sw=""
                    onClick={() => reuse(p.id)}
                  >
                    <Glyph name={kindGlyph(p.kind)} />
                    <span className="se-lbx">
                      {p.name}
                      <span className="se-gl2">{kindName(p.kind)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {back}
              {stage === 'field' && step && !hasNote(step) ? (
                <div className="se-kgrid se-kgrid-note">
                  <button type="button" className="mi se-mi" data-i="" data-sw="" onClick={note}>
                    <Glyph name="note" />
                    <span className="se-lbx">
                      {t('bs.editor.note.name')}
                      <span className="se-gl2">{t('bs.editor.pick.note_gloss')}</span>
                    </span>
                  </button>
                </div>
              ) : null}
              {kinds(stage === 'field' ? FIELD_KINDS : EVIDENCE_KINDS)}
            </>
          )}
        </div>
      </EdPop>
    </>
  );
}
