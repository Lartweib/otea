import { type ReactNode, useState } from 'react';
import { backWaysOf, startsWith, waysOf } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  DONE,
  type FieldKind,
  LEVELS,
  type Lead,
  type Part,
  partOf,
  type Step,
  stepIndex,
  WHEN_KINDS,
} from '../../../../src/core/board/model.ts';
import { useApp } from '../../app/context.tsx';
import { t, tx } from '../../i18n/i18n.ts';
import { MenuItem, MenuLabel } from '../../kit/pop/Menu.tsx';
import { toast } from '../../kit/pop/toast.tsx';
import { problemText, targetName } from '../words.ts';
import { useEditor } from './context.ts';
import { BackConseq, BackRows, DropLine, NoteRow, SkipLine, WaitRow } from './cover.tsx';
import {
  addBackWay,
  addWay,
  hasNote,
  moveStep,
  removeStep,
  removeWay,
  renameStep,
  replaceWay,
  setBack,
  setDoer,
  setLead,
  setReviewer,
} from './edits.ts';
import { Glyph, kindGlyph } from './glyphs.tsx';
import { MentionArea } from './MentionArea.tsx';
import { BackMenu, Blank, EdPop, useAnchor, WayMenu, WhoMenu } from './menus.tsx';
import { AddPart } from './PartPicker.tsx';
import { PartRow } from './PartRow.tsx';
import { reorderChoices } from './reorder.ts';
import { Conseq, sentenceNode } from './SentenceText.tsx';
import { SetupStrip } from './Setup.tsx';
import {
  instructionHints,
  plain,
  roundsSentence,
  startsWithNames,
  stepConseq,
  stepPlace,
  waysConseq,
  whenValueName,
} from './sentences.ts';
import { whoTitle, whoWord } from './who.ts';

// A step's card (mock cardStep): the step as sentences with blanks. Who does it and who reviews it,
// what it starts with, what it hands off, where it goes next, where a send-back lands, and what
// the agent reads.

// Problems shown elsewhere on the card already (as the consequences of who).
const SAID = new Set(['self_review', 'agent_offline']);

// The values a part that a lead (or a «solo cuando») reads can hold, by id and name.
function whenValues(def: BoardDefinition, part: Part): { id: string; name: string }[] {
  if (part.kind === 'level')
    return LEVELS.map((l) => ({ id: l, name: whenValueName(def, part.id, l) }));
  if (part.kind === 'yesno')
    return ['yes', 'no'].map((v) => ({ id: v, name: whenValueName(def, part.id, v) }));
  return part.options.map((c) => ({ id: c.id, name: c.name }));
}

// «Si <campo> es <valor>, va a <paso>»: the step's lead (Step.lead), seen and changed here (p4
// leftover), as Pendientes' «Tu parte» leads a to-do the person does straight to Hecho. The parts
// it can read are those the step starts with or the item carries at any time, as «solo cuando».
function LeadRow({ step }: { step: Step }) {
  const { draft } = useEditor();
  const def = draft.def;
  const i = stepIndex(def, step.id);
  const seen = new Set<string>();
  const parts = [...startsWith(def, step.id).map((o) => o.ref), ...def.anytime]
    .filter((ref) => !seen.has(ref) && seen.add(ref))
    .map((ref) => partOf(def, ref))
    .filter((p): p is Part => !!p && WHEN_KINDS.includes(p.kind as FieldKind));
  const targets = [...def.steps.slice(i + 1).map((s) => s.id), DONE];
  if (!parts.length) return null;
  const set = (lead: Lead | undefined) => draft.mutate((d) => setLead(d, step.id, lead));
  const lead = step.lead;
  if (!lead) {
    const [first] = parts;
    return (
      <div className="se-addrow">
        <button
          type="button"
          className="se-addbtn"
          onClick={() =>
            first &&
            set({
              to: DONE,
              when: { part: first.id, value: whenValues(def, first)[0]?.id ?? '' },
            })
          }
        >
          <Glyph name="plus" />
          {t('bs.editor.lead.add')}
        </button>
      </div>
    );
  }
  const on = partOf(def, lead.when.part);
  const values = on ? whenValues(def, on) : [];
  return (
    <div className="se-lead" data-lead="">
      <div className="se-hgrid se-hgrid3">
        <label className="se-fld">
          <span className="se-flab">{t('bs.editor.lead.if')}</span>
          <select
            className="se-tx"
            value={on?.id ?? ''}
            onChange={(e) => {
              const pick = partOf(def, e.target.value);
              if (pick)
                set({
                  ...lead,
                  when: { part: pick.id, value: whenValues(def, pick)[0]?.id ?? '' },
                });
            }}
          >
            {on ? null : <option value="">{t('bs.editor.part.when_pick')}</option>}
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="se-fld">
          <span className="se-flab">{t('bs.editor.lead.is')}</span>
          <select
            className="se-tx"
            disabled={!on}
            value={lead.when.value}
            onChange={(e) => set({ ...lead, when: { ...lead.when, value: e.target.value } })}
          >
            {values.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="se-fld">
          <span className="se-flab">{t('bs.editor.lead.to')}</span>
          <select
            className="se-tx"
            value={lead.to}
            onChange={(e) => set({ ...lead, to: e.target.value })}
          >
            {targets.map((x) => (
              <option key={x} value={x}>
                {targetName(def, x)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="se-x"
        aria-label={t('bs.editor.lead.remove')}
        title={t('bs.editor.lead.remove')}
        onClick={() => set(undefined)}
      >
        <Glyph name="x" />
      </button>
    </div>
  );
}

export function Section({
  label,
  gloss,
  children,
}: {
  label: string;
  gloss?: string;
  children: ReactNode;
}) {
  return (
    <div className="se-csec">
      <div className="se-ch">
        <span className="margin-label">{label}</span>
        {gloss ? <span className="se-gloss">{gloss}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function StepCard({ step }: { step: Step }) {
  const { draft, dialogs, setOpenRow, pair } = useEditor();
  const app = useApp();
  const def = draft.def;
  const i = stepIndex(def, step.id);
  const doerMenu = useAnchor();
  const revMenu = useAnchor();
  const wayMenu = useAnchor();
  const backMenu = useAnchor();
  const moveMenu = useAnchor();
  const moves = reorderChoices(def, step.id);
  const hints = instructionHints(def, step);
  const [replacing, setReplacing] = useState<string | undefined>(undefined);

  const ways = waysOf(def, step.id);
  const later = [...def.steps.slice(i + 1).map((s) => s.id), DONE].filter((x) => !ways.includes(x));
  const backs = backWaysOf(def, step.id);
  const earlier = def.steps.slice(0, i).filter((s) => !backs.includes(s.id));
  const note = hasNote(step);
  const conseq = stepConseq(step);
  const starts = startsWithNames(def, step);
  const ways2 = waysConseq(def, step);
  const mine = draft.problems.filter(
    (p) => p.at.kind === 'step' && p.at.id === step.id && !SAID.has(p.code),
  );
  const agentGets = step.doer !== 'you' || step.reviewer === 'any';
  const tgt = (x: string) => targetName(def, x);

  const remove = () => {
    const name = step.name;
    // The live board's open items in the step (its reviews included) need a destination.
    const collection = draft.record.collection;
    const items = app.items.status === 'ready' ? app.items.value : [];
    const here = draft.record.live
      ? items.filter(
          (it) =>
            it.collection === collection &&
            it.turn !== 'none' &&
            it.state.replace(/__(review|yours)$/, '') === step.id,
        ).length
      : 0;
    const next = def.steps[i + 1] ?? def.steps[i - 1];
    setOpenRow(null);
    draft.endBurst();
    draft.mutate((d) => removeStep(d, step.id));
    draft.select(next ? { kind: 'step', id: next.id } : { kind: 'form' });
    toast({
      msg: here
        ? tx('bs.editor.toast.step_removed_items', { step: <b>{name}</b>, count: here })
        : tx('bs.editor.toast.step_removed', { step: <b>{name}</b> }),
      undo: () => {
        draft.undo();
        draft.select({ kind: 'step', id: step.id });
      },
    });
  };

  const placeholderPart = starts[1]?.name ?? t('bs.editor.instr.take_part');

  return (
    <>
      <div className="se-chead">
        <div className="se-cht">
          <p className="kicker">
            {pair ? (
              <>
                <b>{def.name}</b> ·{' '}
              </>
            ) : null}
            {sentenceNode(stepPlace(def, step))}
          </p>
          <input
            className="se-stepname"
            value={step.name}
            maxLength={32}
            aria-label={t('bs.editor.card.stepname')}
            onChange={(e) =>
              draft.mutate((d) => renameStep(d, step.id, e.target.value), `step:${step.id}`)
            }
            onBlur={() => draft.endBurst()}
          />
        </div>
        <div className="se-ctools">
          <button
            type="button"
            className="ghost-btn se-movebtn"
            disabled={!moves.length}
            aria-haspopup="menu"
            aria-expanded={moveMenu.open}
            title={moves.length ? t('bs.editor.card.move_label') : t('bs.editor.card.move_only')}
            onClick={(e) => moveMenu.toggle(e.currentTarget)}
          >
            <Glyph name="move" />
            {t('bs.editor.card.move')}
          </button>
          <button
            type="button"
            className="ghost-btn"
            aria-label={t('bs.editor.card.remove')}
            title={t('bs.editor.card.remove')}
            onClick={remove}
          >
            <Glyph name="trash" />
          </button>
        </div>
        <EdPop
          anchor={moveMenu.anchor}
          open={moveMenu.open}
          onClose={moveMenu.close}
          label={t('bs.editor.card.move_label')}
          alignRight
          estimate={130}
        >
          <MenuLabel>{t('bs.editor.card.move_label')}</MenuLabel>
          {moves.map(({ dir, text }) => (
            <MenuItem
              key={dir}
              className="se-mi"
              onPick={() => draft.mutate((d) => moveStep(d, step.id, dir))}
            >
              {text}
            </MenuItem>
          ))}
        </EdPop>
      </div>

      <p className="se-sent se-who">
        {tx('bs.editor.who.sentence', {
          doer: (
            <Blank
              label={whoTitle(step.doer)}
              you={step.doer === 'you'}
              open={doerMenu.open}
              onPress={doerMenu.toggle}
            />
          ),
          does: step.doer === 'you' ? t('bs.editor.who.does_you') : t('bs.editor.who.does'),
          reviewer: (
            <Blank
              label={whoWord(step.reviewer, 'reviewer')}
              you={step.reviewer === 'you'}
              open={revMenu.open}
              onPress={revMenu.toggle}
            />
          ),
          reviews:
            step.reviewer === 'you' ? t('bs.editor.who.reviews_you') : t('bs.editor.who.reviews'),
        })}
      </p>
      <SetupStrip what="doer" ref_={step.id} />
      <WhoMenu
        kind="doer"
        current={step.doer}
        anchor={doerMenu.anchor}
        open={doerMenu.open}
        onClose={doerMenu.close}
        onPick={(who) => draft.mutate((d) => setDoer(d, step.id, who as Step['doer']))}
      />
      <WhoMenu
        kind="reviewer"
        current={step.reviewer}
        anchor={revMenu.anchor}
        open={revMenu.open}
        onClose={revMenu.close}
        onPick={(who) => draft.mutate((d) => setReviewer(d, step.id, who as Step['reviewer']))}
      />
      <div className="se-conseqs">
        {conseq.map((s) => (
          <Conseq key={s.key} s={s} />
        ))}
      </div>

      <Section label={t('bs.editor.card.starts')} gloss={t('bs.editor.card.starts_gloss')}>
        <div className="se-startswith">
          {starts.map((o) => (
            <span
              key={o.ref}
              className="se-chip0"
              title={
                o.from
                  ? t('bs.editor.card.from_step', { step: o.from })
                  : t('bs.editor.card.from_form')
              }
            >
              <Glyph name={kindGlyph(o.kind)} />
              {o.name}
            </span>
          ))}
        </div>
      </Section>

      <Section label={t('bs.editor.card.hand')} gloss={t('bs.editor.card.hand_gloss')}>
        {step.hand.length === 0 && !note && !step.waits.length ? (
          <p className="se-emptyx">
            {tx(
              step.doer === 'you'
                ? 'bs.editor.card.hand_empty_you'
                : 'bs.editor.card.hand_empty_agent',
              {
                examples: <b>{t('bs.editor.card.hand_examples')}</b>,
              },
            )}
          </p>
        ) : null}
        <div className="se-hlist">
          <NoteRow step={step} />
          {step.hand.map((hand) => (
            <PartRow key={hand.ref} entry={{ at: { type: 'step', step: step.id }, hand }} />
          ))}
          {step.waits.map((w) => (
            <WaitRow key={w} step={step} wait={w} />
          ))}
        </div>
        <div className="se-addrow">
          <AddPart at={{ type: 'step', step: step.id }} label={t('bs.editor.card.hand_add')} />
        </div>
        <SkipLine step={step} />
      </Section>

      <Section
        label={t('bs.editor.card.next')}
        gloss={
          step.reviewer === 'none'
            ? t('bs.editor.card.next_handed')
            : t('bs.editor.card.next_approved')
        }
      >
        <div className="se-ways">
          <div className="se-wayrow">
            {tx(
              step.reviewer === 'you'
                ? ways[0] === DONE
                  ? 'bs.editor.ways.done_approve'
                  : 'bs.editor.ways.default_approve'
                : ways[0] === DONE
                  ? 'bs.editor.ways.done'
                  : 'bs.editor.ways.default',
              { target: <b>{tgt(ways[0] ?? DONE)}</b> },
            )}
          </div>
          {ways.slice(1).map((w) => (
            <div key={w} className="se-wayrow">
              {t('bs.editor.ways.or')}{' '}
              <Blank
                label={tgt(w)}
                open={wayMenu.open && replacing === w}
                onPress={(el) => {
                  setReplacing(w);
                  wayMenu.toggle(el);
                }}
              />
              <button
                type="button"
                className="se-x"
                aria-label={t('bs.editor.ways.remove')}
                title={t('bs.editor.ways.remove')}
                onClick={() => draft.mutate((d) => removeWay(d, step.id, w))}
              >
                <Glyph name="x" />
              </button>
            </div>
          ))}
          <BackRows step={step} />
        </div>
        {later.length || earlier.length ? (
          <div className="se-addrow">
            <button
              type="button"
              className="se-addbtn"
              aria-haspopup="menu"
              aria-expanded={wayMenu.open && !replacing}
              onClick={(e) => {
                setReplacing(undefined);
                wayMenu.toggle(e.currentTarget);
              }}
            >
              <Glyph name="plus" />
              {t('bs.editor.ways.add')}
            </button>
          </div>
        ) : null}
        <LeadRow step={step} />
        <WayMenu
          def={def}
          step={step}
          replace={replacing}
          anchor={wayMenu.anchor}
          open={wayMenu.open}
          onClose={wayMenu.close}
          targetName={tgt}
          onPick={(target, back) =>
            draft.mutate((d) =>
              back
                ? addBackWay(d, step.id, target)
                : replacing
                  ? replaceWay(d, step.id, replacing, target)
                  : addWay(d, step.id, target),
            )
          }
        />
        {ways2 ? <Conseq s={ways2} id="se-ways-conseq" /> : null}
        <BackConseq step={step} />
        <DropLine step={step} />
      </Section>

      {step.reviewer === 'you' ? (
        <Section label={t('bs.editor.back.title')} gloss={t('bs.editor.back.gloss')}>
          <p className="se-sent se-sent-sm">
            {tx('bs.editor.back.sentence', {
              target: (
                <Blank
                  label={step.back === 'same' ? t('bs.editor.back.same') : tgt(step.back)}
                  open={backMenu.open}
                  onPress={backMenu.toggle}
                />
              ),
            })}
          </p>
          <BackMenu
            def={def}
            step={step}
            anchor={backMenu.anchor}
            open={backMenu.open}
            onClose={backMenu.close}
            onPick={(back) => draft.mutate((d) => setBack(d, step.id, back))}
          />
          <Conseq s={roundsSentence(def, step)} />
        </Section>
      ) : null}

      <Section label={t('bs.editor.instr.title')} gloss={t('bs.editor.instr.gloss')}>
        {!agentGets ? (
          <p className="se-emptyx">{t('bs.editor.instr.yours')}</p>
        ) : (
          <div className="se-instr">
            {step.doer !== 'you' ? (
              <>
                <MentionArea
                  at={{ step: step.id, key: 'take' }}
                  stored={step.instructions.take}
                  label={t('bs.editor.instr.take')}
                  small={t('bs.editor.instr.take_small')}
                  placeholder={t('bs.editor.instr.take_ph', { part: placeholderPart })}
                />
                <MentionArea
                  at={{ step: step.id, key: 'before' }}
                  stored={step.instructions.before}
                  label={t('bs.editor.instr.before')}
                  small={t('bs.editor.instr.before_small')}
                  placeholder={t('bs.editor.instr.before_ph')}
                />
              </>
            ) : null}
            {step.reviewer === 'any' ? (
              <MentionArea
                at={{ step: step.id, key: 'review' }}
                stored={step.instructions.review}
                label={t('bs.editor.instr.review')}
                small={t('bs.editor.instr.review_small')}
                placeholder={t('bs.editor.instr.review_ph')}
              />
            ) : null}
          </div>
        )}
        {hints.map((h) => (
          <Conseq key={plain(h)} s={h} />
        ))}
      </Section>

      {mine.length ? (
        <div className="se-warns">
          {mine.map((p) => (
            <p key={p.code + JSON.stringify(p.params)} className="se-conseq warn">
              {problemText(p)}
            </p>
          ))}
        </div>
      ) : null}
      <p className="se-cfoot">
        {tx('bs.editor.card.foot', {
          practice: (
            <button type="button" className="btn text sm" onClick={dialogs.practice}>
              {t('bs.editor.card.practice')}
            </button>
          ),
        })}
      </p>
    </>
  );
}
