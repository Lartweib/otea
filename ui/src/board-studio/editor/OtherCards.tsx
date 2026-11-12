import { waysOf } from '../../../../src/core/board/engine.ts';
import { DONE, TITLE } from '../../../../src/core/board/model.ts';
import { listOf, t, tx } from '../../i18n/i18n.ts';
import { doesText } from '../words.ts';
import { useEditor } from './context.ts';
import { setBoardName, setCap, setIcon, setItemName } from './edits.ts';
import { BOARD_ICONS, boardGlyph, Glyph } from './glyphs.tsx';
import { MentionArea } from './MentionArea.tsx';
import { AddPart } from './PartPicker.tsx';
import { PartRow } from './PartRow.tsx';
import { Section } from './StepCard.tsx';

// The cards that are not steps (mock cardForm, cardDone, cardAbout, cardAny): what creating an
// item asks for, Hecho, the board itself with its instructions and cap, and what can be filled in
// at any time.

function Head({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="se-chead">
      <div className="se-cht">
        <p className="kicker">{kicker}</p>
        <h2 className="se-ctitle">{title}</h2>
      </div>
    </div>
  );
}

export function FormCard() {
  const { draft } = useEditor();
  const def = draft.def;
  const first = def.steps[0];
  return (
    <>
      <Head
        kicker={t('bs.editor.form.kicker')}
        title={t('bs.editor.route.create', { item: def.item })}
      />
      <p className="se-sent se-sent-sm">{t('bs.editor.form.sentence')}</p>
      <Section label={t('bs.editor.form.asks')} gloss={t('bs.editor.form.order')}>
        <div className="se-hlist">
          <PartRow entry={{ at: { type: 'form' }, ref: TITLE, required: true }} />
          {def.form.map((f) => (
            <PartRow
              key={f.ref}
              entry={{ at: { type: 'form' }, ref: f.ref, required: f.required }}
            />
          ))}
        </div>
        <div className="se-addrow">
          <AddPart at={{ type: 'form' }} label={t('bs.editor.form.add')} />
        </div>
      </Section>
      <Section label={t('bs.editor.card.next')}>
        <p className="se-conseq">
          {first
            ? tx('bs.editor.form.then', {
                step: <b>{first.name.trim() || t('bs.editor.route.unnamed')}</b>,
                does: doesText(first.doer),
              })
            : t('bs.editor.form.no_step')}
        </p>
      </Section>
    </>
  );
}

export function DoneCard() {
  const { draft } = useEditor();
  const def = draft.def;
  const reach = def.steps
    .filter((s, i) => i === def.steps.length - 1 || waysOf(def, s.id).slice(1).includes(DONE))
    .map((s) => s.name.trim() || t('bs.editor.route.unnamed'));
  return (
    <>
      <Head kicker={t('bs.editor.done.kicker')} title={t('bs.done')} />
      <p className="se-sent se-sent-sm">
        {tx('bs.editor.done.sentence', {
          steps: reach.length ? <b>{listOf(reach)}</b> : t('bs.editor.done.last'),
        })}
      </p>
      <p className="se-conseq">
        {tx('bs.editor.done.drop', { dropped: <b>{t('bs.dropped')}</b> })}
      </p>
      <p className="se-conseq">{t('bs.editor.done.fixed')}</p>
    </>
  );
}

export function AboutCard() {
  const { draft } = useEditor();
  const def = draft.def;
  const end = () => draft.endBurst();
  return (
    <>
      <Head kicker={t('bs.editor.about.kicker')} title={t('bs.editor.ends.about')} />
      <div className="se-csec">
        <div className="se-hgrid">
          <label className="se-fld">
            <span className="se-flab">{t('bs.editor.name.label')}</span>
            <input
              className="se-tx"
              value={def.name}
              maxLength={40}
              onChange={(e) => draft.mutate((d) => setBoardName(d, e.target.value), 'board:name')}
              onBlur={end}
            />
          </label>
          <label className="se-fld">
            <span className="se-flab">{t('bs.editor.about.item')}</span>
            <input
              className="se-tx"
              value={def.item}
              maxLength={24}
              placeholder={t('bs.editor.about.item_ph')}
              onChange={(e) => draft.mutate((d) => setItemName(d, e.target.value), 'board:item')}
              onBlur={end}
            />
          </label>
        </div>
        <p className="se-conseq">{t('bs.editor.about.names')}</p>
        <div className="se-iconrow">
          <span className="se-flab">{t('bs.editor.about.icon')}</span>
          <div className="se-iconpick">
            {BOARD_ICONS.map((k) => (
              <button
                key={k}
                type="button"
                className={boardGlyph(def.icon) === k ? 'on' : undefined}
                aria-pressed={boardGlyph(def.icon) === k}
                aria-label={k}
                onClick={() => draft.mutate((d) => setIcon(d, k))}
              >
                <Glyph name={k} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <Section label={t('bs.editor.about.instr')} gloss={t('bs.editor.about.instr_gloss')}>
        <div className="se-instr">
          <MentionArea
            at={{ board: 'about' }}
            stored={def.about}
            rows={3}
            label={t('bs.editor.about.about')}
            small={t('bs.editor.about.about_small')}
            placeholder={t('bs.editor.about.about_ph')}
          />
          <MentionArea
            at={{ board: 'idle' }}
            stored={def.idle}
            label={t('bs.editor.about.idle')}
            small={t('bs.editor.about.idle_small')}
            placeholder={t('bs.editor.about.idle_ph')}
          />
        </div>
        <div className="se-capline">
          <button
            type="button"
            className="se-sw"
            role="switch"
            aria-checked={def.cap.on}
            aria-label={t('bs.editor.about.cap')}
            onClick={() => draft.mutate((d) => setCap(d, { on: !d.cap.on }))}
          />
          <span>{t('bs.editor.about.cap_a')}</span>
          <input
            type="number"
            min={1}
            max={20}
            value={def.cap.n}
            aria-label={t('bs.editor.about.cap')}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              draft.mutate((d) => setCap(d, { n: Number.isFinite(n) ? n : 0 }), 'board:cap');
            }}
            onBlur={end}
          />
          <span>{t('bs.editor.about.cap_b')}</span>
        </div>
        <p className="se-conseq">
          {def.cap.on
            ? t('bs.editor.about.cap_on', { n: def.cap.n })
            : t('bs.editor.about.cap_off')}
        </p>
      </Section>
    </>
  );
}

export function AnyCard() {
  const { draft } = useEditor();
  const def = draft.def;
  return (
    <>
      <Head kicker={t('bs.editor.any.kicker')} title={t('bs.editor.ends.anytime')} />
      <p className="se-sent se-sent-sm">{t('bs.editor.any.sentence')}</p>
      <Section label={t('bs.editor.any.list')}>
        {def.anytime.length === 0 ? (
          <p className="se-emptyx">
            {tx('bs.editor.any.empty', { examples: <b>{t('bs.editor.any.examples')}</b> })}
          </p>
        ) : null}
        <div className="se-hlist">
          {def.anytime.map((ref) => (
            <PartRow key={ref} entry={{ at: { type: 'anytime' }, ref }} />
          ))}
        </div>
        <div className="se-addrow">
          <AddPart at={{ type: 'anytime' }} label={t('bs.editor.any.add')} />
        </div>
      </Section>
    </>
  );
}
