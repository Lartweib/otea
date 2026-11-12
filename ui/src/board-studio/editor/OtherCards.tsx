import { useState } from 'react';
import { waysOf } from '../../../../src/core/board/engine.ts';
import { DONE, SAME, TITLE } from '../../../../src/core/board/model.ts';
import { listOf, t, tx } from '../../i18n/i18n.ts';
import { MenuItem, MenuLabel, MenuRule } from '../../kit/pop/Menu.tsx';
import { studioHash } from '../../selection.ts';
import { doesText } from '../words.ts';
import { useEditor } from './context.ts';
import {
  addMotive,
  removeMotive,
  setBoardName,
  setCap,
  setDropBy,
  setIcon,
  setItemName,
  setSplit,
  setSplitAlways,
} from './edits.ts';
import { BOARD_ICONS, boardGlyph, Glyph } from './glyphs.tsx';
import { parentInfo, splitInfo } from './joined.ts';
import { MentionArea } from './MentionArea.tsx';
import { Blank, EdPop, useAnchor } from './menus.tsx';
import { AddPart } from './PartPicker.tsx';
import { PartRow } from './PartRow.tsx';
import { Section } from './StepCard.tsx';

// The cards that are not steps (mock cardForm, cardDone, cardAbout, cardAny): what creating an
// item asks for, Hecho, the board itself with its instructions and cap, and what can be filled in
// at any time.

function Head({ kicker, title }: { kicker: string; title: string }) {
  const { pair, draft } = useEditor();
  return (
    <div className="se-chead">
      <div className="se-cht">
        <p className="kicker">
          {pair ? (
            <>
              <b>{draft.def.name}</b> ·{' '}
            </>
          ) : null}
          {kicker}
        </p>
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
      <ParentNote />
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
  const by = useAnchor();
  const [typed, setTyped] = useState('');
  const reach = def.steps
    .filter((s, i) => i === def.steps.length - 1 || waysOf(def, s.id).slice(1).includes(DONE))
    .map((s) => s.name.trim() || t('bs.editor.route.unnamed'));
  const motives = def.drop.motives;
  const droppers = def.steps.filter((s) => s.doerMayDrop && s.doer !== 'you');
  return (
    <>
      <Head kicker={t('bs.editor.done.kicker')} title={t('bs.done')} />
      <p className="se-sent se-sent-sm">
        {tx('bs.editor.done.sentence', {
          steps: reach.length ? <b>{listOf(reach)}</b> : t('bs.editor.done.last'),
        })}
      </p>
      <Section label={t('bs.editor.drop.title')} gloss={t('bs.editor.drop.gloss')}>
        <p className="se-sent se-sent-sm">
          {tx('bs.editor.drop.by', {
            by: (
              <span className="se-nw">
                <Blank
                  you
                  label={
                    def.drop.by === 'page' ? t('bs.editor.drop.page') : t('bs.editor.drop.anyone')
                  }
                  open={by.open}
                  onPress={by.toggle}
                />
                .
              </span>
            ),
          })}
        </p>
        <EdPop
          open={by.open}
          anchor={by.anchor}
          onClose={by.close}
          label={t('bs.editor.drop.by_menu')}
        >
          <MenuLabel>{t('bs.editor.drop.by_menu')}</MenuLabel>
          <MenuItem
            on={def.drop.by !== 'page'}
            className="se-mi"
            onPick={() => draft.mutate((d) => setDropBy(d, 'anyone'))}
          >
            <span className="se-lbx">
              {t('bs.editor.drop.anyone')}
              <span className="se-gl2">{t('bs.editor.drop.anyone_gloss')}</span>
            </span>
          </MenuItem>
          <MenuItem
            on={def.drop.by === 'page'}
            className="se-mi"
            onPick={() => draft.mutate((d) => setDropBy(d, 'page'))}
          >
            <span className="se-lbx">
              {t('bs.editor.drop.page')}
              <span className="se-gl2">{t('bs.editor.drop.page_gloss')}</span>
            </span>
          </MenuItem>
        </EdPop>
        <div className="se-motives">
          <span className="se-flab">{t('bs.editor.drop.motives')}</span>
          <div className="se-opts">
            {motives.map((m) => (
              <span key={m.id} className="se-opt">
                {m.name}
                <button
                  type="button"
                  aria-label={t('bs.editor.part.option_remove', { name: m.name })}
                  onClick={() => draft.mutate((d) => removeMotive(d, m.id))}
                >
                  <Glyph name="x" />
                </button>
              </span>
            ))}
            <input
              value={typed}
              placeholder={t('bs.editor.part.option_ph')}
              aria-label={t('bs.editor.drop.motive_add')}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const name = typed.trim();
                if (!name) return;
                draft.mutate((d) => addMotive(d, name));
                setTyped('');
              }}
            />
          </div>
        </div>
        <p className="se-conseq">
          {motives.length ? t('bs.editor.drop.filter') : t('bs.editor.drop.none')}
        </p>
        {droppers.length ? (
          <p className="se-conseq">
            {tx('bs.editor.drop.droppers', {
              steps: <b>{listOf(droppers.map((s) => s.name))}</b>,
            })}
          </p>
        ) : null}
      </Section>
      <p className="se-conseq se-done-fixed">{t('bs.editor.done.fixed')}</p>
    </>
  );
}

// "Cada Tarea de repo se crea dentro de su Cambio: lo dice Cambios." on a child board's form.
function ParentNote() {
  const { draft, boards } = useEditor();
  const par = parentInfo(boards, draft.record.id);
  if (!par) return null;
  return (
    <p className="se-sent se-ro">
      {tx(par.always ? 'bs.editor.form.parent_always' : 'bs.editor.form.parent_may', {
        item: draft.def.item,
        parent: par.item,
        board: <ParentLink id={par.id} name={par.name} />,
      })}
    </p>
  );
}

// A named link to the parent board's About, in place when the pair is one workspace.
function ParentLink({ id, name }: { id: string; name: string }) {
  const { pair, setOpenRow } = useEditor();
  if (pair && pair.ids.parent === id)
    return (
      <button
        type="button"
        className="se-lnk"
        onClick={() => {
          setOpenRow(null);
          pair.switchTo('parent', { kind: 'about' });
        }}
      >
        {name}
      </button>
    );
  return (
    <a className="se-lnk" href={studioHash({ kind: 'board', board: id })}>
      {name}
    </a>
  );
}

// Sobre el tablero › Partes: what each item divides into, and (on a child board) whose part it is.
function PartsSection() {
  const { draft, boards } = useEditor();
  const def = draft.def;
  const self = draft.record.id;
  const split = useAnchor();
  const always = useAnchor();
  const sp = splitInfo(def, boards, self);
  const par = parentInfo(boards, self);
  const others = boards.filter((b) => b.id !== self && !b.builtin);
  const current = def.split?.board ?? '';
  const other = sp && !sp.same ? sp : null;
  return (
    <Section
      label={t('bs.editor.parts.title')}
      gloss={t('bs.editor.parts.gloss', { item: def.item })}
    >
      <p className="se-sent se-sent-sm se-partsent">
        {tx('bs.editor.parts.sentence', {
          item: def.item,
          into: (
            <span className="se-nw">
              <Blank
                label={
                  sp
                    ? sp.same
                      ? t('bs.editor.parts.same')
                      : sp.name
                    : t('bs.editor.parts.nothing')
                }
                open={split.open}
                onPress={split.toggle}
              />
              {other ? ',' : '.'}
            </span>
          ),
        })}
        {other ? (
          <>
            {' '}
            {tx('bs.editor.parts.and_each', {
              part: other.item,
              always: (
                <span className="se-nw">
                  <Blank
                    label={
                      other.always
                        ? t('bs.editor.parts.always', { item: def.item })
                        : t('bs.editor.parts.alone', { item: def.item })
                    }
                    open={always.open}
                    onPress={always.toggle}
                  />
                  .
                </span>
              ),
            })}
          </>
        ) : null}
      </p>
      <EdPop
        open={split.open}
        anchor={split.anchor}
        onClose={split.close}
        label={t('bs.editor.parts.title')}
        estimate={340}
      >
        <MenuLabel>{t('bs.editor.parts.menu', { item: def.item })}</MenuLabel>
        <MenuItem
          on={!current}
          className="se-mi"
          onPick={() => draft.mutate((d) => setSplit(d, undefined))}
        >
          <span className="se-lbx">
            {t('bs.editor.parts.nothing_title')}
            <span className="se-gl2">{t('bs.editor.parts.nothing_gloss')}</span>
          </span>
        </MenuItem>
        <MenuItem
          on={current === SAME}
          className="se-mi"
          onPick={() => draft.mutate((d) => setSplit(d, SAME))}
        >
          <span className="se-lbx">
            {t('bs.editor.parts.same_title')}
            <span className="se-gl2">{t('bs.editor.parts.same_gloss')}</span>
          </span>
        </MenuItem>
        {others.length ? (
          <>
            <MenuRule />
            <MenuLabel>{t('bs.editor.parts.other')}</MenuLabel>
          </>
        ) : null}
        {others.map((b) => (
          <MenuItem
            key={b.id}
            on={current === b.id}
            className="se-mi"
            onPick={() => draft.mutate((d) => setSplit(d, b.id))}
          >
            <Glyph name={boardGlyph(b.definition.icon)} />
            <span className="se-lbx">
              {b.definition.name}
              <span className="se-gl2">
                {t('bs.editor.parts.board_gloss', {
                  item: b.definition.item,
                  count: b.definition.steps.length,
                })}
                {b.liveVersion === null ? ` · ${t('bs.editor.parts.unpublished')}` : ''}
              </span>
            </span>
          </MenuItem>
        ))}
      </EdPop>
      {other ? (
        <EdPop
          open={always.open}
          anchor={always.anchor}
          onClose={always.close}
          label={t('bs.editor.parts.always_menu')}
        >
          <MenuItem
            on={other.always}
            className="se-mi"
            onPick={() => draft.mutate((d) => setSplitAlways(d, true))}
          >
            <span className="se-lbx">
              {t('bs.editor.parts.always', { item: def.item })}
              <span className="se-gl2">{t('bs.editor.parts.always_gloss')}</span>
            </span>
          </MenuItem>
          <MenuItem
            on={!other.always}
            className="se-mi"
            onPick={() => draft.mutate((d) => setSplitAlways(d, false))}
          >
            <span className="se-lbx">
              {t('bs.editor.parts.alone', { item: def.item })}
              <span className="se-gl2">
                {t('bs.editor.parts.alone_gloss', { board: other.name })}
              </span>
            </span>
          </MenuItem>
        </EdPop>
      ) : null}
      <p className="se-conseq">
        {sp
          ? sp.same
            ? t('bs.editor.parts.conseq_same', { item: def.item })
            : tx('bs.editor.parts.conseq', { item: def.item, board: <b>{sp.name}</b> })
          : t('bs.editor.parts.conseq_none')}
      </p>
      {other && !other.published ? (
        <p className="se-conseq warn">
          {tx('bs.editor.parts.unpublished_warn', { board: <b>{other.name}</b> })}
        </p>
      ) : null}
      {par ? (
        <p className="se-sent se-ro">
          {par.always
            ? tx('bs.editor.parts.child_always', {
                item: def.item,
                parent: par.item,
                board: <ParentLink id={par.id} name={par.name} />,
              })
            : tx('bs.editor.parts.child_may', {
                item: def.item,
                parent: par.item,
                name: def.name,
                board: <ParentLink id={par.id} name={par.name} />,
              })}
        </p>
      ) : null}
    </Section>
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
      <PartsSection />
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
