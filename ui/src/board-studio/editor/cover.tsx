import { type ReactNode, useState } from 'react';
import { backWaysOf } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  LEVELS,
  type Part,
  type Step,
  stepIndex,
  type Wait,
} from '../../../../src/core/board/model.ts';
import { listOf, listOr, t, tx } from '../../i18n/i18n.ts';
import { ChipButton } from '../../kit/Button.tsx';
import { AgentMark } from '../../kit/Marks.tsx';
import { MenuItem, MenuLabel, MenuNote, MenuRule } from '../../kit/pop/Menu.tsx';
import { toast } from '../../kit/pop/toast.tsx';
import { initialName, kindName, targetName } from '../words.ts';
import { useEditor } from './context.ts';
import {
  hasNote,
  removeBackWay,
  removeNote,
  removeWait,
  replaceBackWay,
  setDoerMayDrop,
  setGuard,
  setGuardBase,
  setGuardRepo,
  setInitial,
  setNoteHint,
  setNoteReq,
  setShow,
  setSkip,
  toggleGuardPush,
} from './edits.ts';
import { Chev, Glyph, kindGlyph } from './glyphs.tsx';
import { splitInfo } from './joined.ts';
import { Blank, EdPop, useAnchor } from './menus.tsx';
import { Unroll } from './PartRow.tsx';
import { SetupStrip } from './Setup.tsx';
import { whoWord } from './who.ts';

// The sentences the boards-for-everything settings add to cards that already exist (mock
// 75-cover.js): the handoff's note and what a step waits for, as rows of its Entrega; the skip on
// creation; the ways back; an agent dropping it; and, on a field, where it starts, a protected
// branch and a long text shown as options. Each is a blank or a switch with what it means under it.

const unnamed = (name: string) => name.trim() || t('bs.editor.route.unnamed');

// A switch and its sentence on one line (mock capline sw1).
export function SwitchLine({
  on,
  label,
  onToggle,
  children,
  className,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `se-capline se-sw1 ${className}` : 'se-capline se-sw1'}>
      <button
        type="button"
        className="se-sw"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
      />
      <span>{children}</span>
    </div>
  );
}

// ---- Entrega: the note and the waits ----

function RowHead({
  open,
  glyph,
  name,
  sub,
  req,
  on,
  onToggle,
}: {
  open: boolean;
  glyph: 'note' | 'wait';
  name: string;
  sub: string;
  req: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="se-hh" aria-expanded={open} onClick={onToggle}>
      <span className="se-hic">
        <Glyph name={glyph} />
      </span>
      <span className="se-hmain">
        <span className="se-hn">{name}</span>
        <span className="se-hk">{sub}</span>
      </span>
      <span className={on ? 'se-req on' : 'se-req'}>{req}</span>
      <Chev />
    </button>
  );
}

export function NoteRow({ step }: { step: Step }) {
  const { draft, openRow, setOpenRow } = useEditor();
  if (!hasNote(step)) return null;
  const open = openRow === 'note';
  const on = step.note.req === 'always';
  const set = (req: 'always' | 'no') =>
    draft.mutate((d) => setNoteReq(d, step.id, req, t('bs.editor.note.default_hint')));
  return (
    <div className={open ? 'se-hrow open' : 'se-hrow'} data-row="note">
      <RowHead
        open={open}
        glyph="note"
        name={t('bs.editor.note.name')}
        sub={step.note.hint.trim() || t('bs.editor.note.default_hint')}
        req={on ? t('bs.editor.note.req_on') : t('bs.editor.req.no')}
        on={on}
        onToggle={() => {
          draft.endBurst();
          setOpenRow(open ? null : 'note');
        }}
      />
      <Unroll open={open}>
        <label className="se-fld">
          <span className="se-flab">{t('bs.editor.part.hint')}</span>
          <input
            className="se-tx"
            value={step.note.hint}
            maxLength={80}
            placeholder={t('bs.editor.part.hint_ph')}
            onChange={(e) =>
              draft.mutate((d) => setNoteHint(d, step.id, e.target.value), `note:${step.id}`)
            }
            onBlur={() => draft.endBurst()}
          />
        </label>
        <div>
          <span className="se-flab">{t('bs.editor.part.needed')}</span>
          <div className="se-radios">
            <ChipButton on={on} onClick={() => set('always')}>
              {t('bs.editor.part.always')}
            </ChipButton>
            <ChipButton on={!on} onClick={() => set('no')}>
              {t('bs.editor.part.no')}
            </ChipButton>
          </div>
        </div>
        <p className="se-conseq">
          {on
            ? `${t(step.doer === 'you' ? 'bs.editor.note.req_you' : 'bs.editor.note.req_agent')} `
            : ''}
          {t('bs.editor.note.rounds')}
        </p>
        <div className="se-hfoot">
          <button
            type="button"
            className="btn text sm se-warnbtn"
            onClick={() => {
              setOpenRow(null);
              draft.mutate((d) => removeNote(d, step.id));
              toast({
                msg: tx('bs.editor.toast.note_removed', {
                  note: <b>{t('bs.editor.note.name')}</b>,
                }),
                undo: draft.undo,
              });
            }}
          >
            {t('bs.editor.part.remove_step')}
          </button>
        </div>
      </Unroll>
    </div>
  );
}

// "Que terminen Tareas de repo": the board the parts are on, or "sus partes".
export function partsLabel(
  def: BoardDefinition,
  boards: Parameters<typeof splitInfo>[1],
  self: string,
) {
  const sp = splitInfo(def, boards, self);
  return sp && !sp.same ? sp.name : t('bs.editor.wait.its_parts');
}

export function WaitRow({ step, wait }: { step: Step; wait: Wait }) {
  const { draft, openRow, setOpenRow, boards, pair } = useEditor();
  const def = draft.def;
  const self = draft.record.id;
  const ref = `wait:${wait}`;
  const open = openRow === ref;
  const sp = splitInfo(def, boards, self);
  const label = partsLabel(def, boards, self);
  const parts = wait === 'parts';
  const about = () => {
    setOpenRow(null);
    if (pair) pair.switchTo(pair.role, { kind: 'about' });
    else draft.select({ kind: 'about' });
  };
  return (
    <div className={open ? 'se-hrow open' : 'se-hrow'} data-row={ref}>
      <RowHead
        open={open}
        glyph="wait"
        name={
          parts
            ? t('bs.editor.wait.parts_name', { board: label })
            : t('bs.editor.wait.blockers_name')
        }
        sub={
          parts && !sp
            ? `${t('bs.editor.wait.kind')} · ${t('bs.editor.wait.no_split_yet')}`
            : t('bs.editor.wait.kind')
        }
        req={t('bs.editor.wait.req')}
        on
        onToggle={() => setOpenRow(open ? null : ref)}
      />
      <Unroll open={open}>
        <p className="se-sent se-sent-sm">
          {parts
            ? tx('bs.editor.wait.parts_sent', { board: <b>{label}</b> })
            : t('bs.editor.wait.blockers_sent')}
        </p>
        {parts && !sp ? (
          <p className="se-conseq warn">
            {tx('bs.editor.wait.first_split', {
              about: (
                <button type="button" className="se-lnk" onClick={about}>
                  {t('bs.editor.ends.about')}
                </button>
              ),
              item: def.item,
            })}
          </p>
        ) : null}
        <p className="se-conseq">
          {parts ? t('bs.editor.wait.parts_conseq') : t('bs.editor.wait.blockers_conseq')}{' '}
          {t('bs.editor.wait.approve')}
        </p>
        <div className="se-hfoot">
          <button
            type="button"
            className="btn text sm se-warnbtn"
            onClick={() => {
              setOpenRow(null);
              draft.mutate((d) => removeWait(d, step.id, wait));
              toast({
                msg: tx(
                  parts
                    ? 'bs.editor.toast.wait_parts_removed'
                    : 'bs.editor.toast.wait_blockers_removed',
                  {
                    step: <b>{unnamed(step.name)}</b>,
                  },
                ),
                undo: draft.undo,
              });
            }}
          >
            {t('bs.editor.part.remove_step')}
          </button>
        </div>
      </Unroll>
    </div>
  );
}

// The first step nobody reviews: "Si al crearlo ya trae todo esto, empieza directamente en Triar."
export function SkipLine({ step }: { step: Step }) {
  const { draft } = useEditor();
  const def = draft.def;
  const i = stepIndex(def, step.id);
  const next = def.steps[1];
  if (i !== 0 || step.reviewer !== 'none' || !next) return null;
  if (!step.hand.some((h) => h.req === 'always') && !step.skipWhenReady) return null;
  return (
    <>
      <SwitchLine
        className="se-skipline"
        on={step.skipWhenReady}
        label={t('bs.editor.skip.label', { step: unnamed(next.name) })}
        onToggle={() => draft.mutate((d) => setSkip(d, step.id, !step.skipWhenReady))}
      >
        {tx('bs.editor.skip.sentence', { step: <b>{unnamed(next.name)}</b> })}
      </SwitchLine>
      {step.skipWhenReady ? (
        <p className="se-conseq">
          {tx('bs.editor.skip.conseq', { step: <b>{unnamed(step.name)}</b> })}
        </p>
      ) : null}
    </>
  );
}

// ---- Después: the ways back and an agent dropping it ----

export function BackRows({ step }: { step: Step }) {
  const { draft } = useEditor();
  const def = draft.def;
  const menu = useAnchor();
  const [replacing, setReplacing] = useState<string | null>(null);
  const backs = backWaysOf(def, step.id);
  const you = step.doer === 'you';
  const i = stepIndex(def, step.id);
  const earlier = def.steps.slice(0, i).filter((s) => !backs.includes(s.id) || s.id === replacing);
  return (
    <>
      {backs.map((b) => (
        <div key={b} className="se-wayrow">
          {t(you ? 'bs.editor.back_way.or_you' : 'bs.editor.back_way.or')}{' '}
          <Blank
            label={`↩ ${targetName(def, b)}`}
            you={you}
            open={menu.open && replacing === b}
            onPress={(el) => {
              setReplacing(b);
              menu.toggle(el);
            }}
          />
          {you ? ` ${t('bs.editor.back_way.with_note')}` : null}
          <button
            type="button"
            className="se-x"
            aria-label={t('bs.editor.ways.remove')}
            title={t('bs.editor.ways.remove')}
            onClick={() => draft.mutate((d) => removeBackWay(d, step.id, b))}
          >
            <Glyph name="x" />
          </button>
        </div>
      ))}
      <EdPop
        open={menu.open}
        anchor={menu.anchor}
        onClose={menu.close}
        label={t('bs.editor.back_way.menu_agent')}
      >
        <MenuLabel>
          {t(you ? 'bs.editor.back_way.menu_you' : 'bs.editor.back_way.menu_agent')}
        </MenuLabel>
        {earlier.map((s) => (
          <MenuItem
            key={s.id}
            on={s.id === replacing}
            className="se-mi"
            onPick={() =>
              replacing && draft.mutate((d) => replaceBackWay(d, step.id, replacing, s.id))
            }
          >
            <span className="se-lbx">
              ↩ {unnamed(s.name)}
              <span className="se-gl2">
                {t(you ? 'bs.editor.back_way.gloss_you' : 'bs.editor.back_way.gloss_agent')}
              </span>
            </span>
          </MenuItem>
        ))}
      </EdPop>
    </>
  );
}

export function BackConseq({ step }: { step: Step }) {
  const { draft } = useEditor();
  const def = draft.def;
  return (
    <>
      {backWaysOf(def, step.id).map((b) => (
        <p key={b} className="se-conseq">
          {tx(
            step.doer === 'you'
              ? 'bs.editor.back_way.conseq_you'
              : 'bs.editor.back_way.conseq_agent',
            {
              step: <b>{targetName(def, b)}</b>,
            },
          )}
        </p>
      ))}
    </>
  );
}

export function DropLine({ step }: { step: Step }) {
  const { draft } = useEditor();
  const motives = draft.def.drop.motives;
  if (step.doer === 'you') return null;
  return (
    <>
      <SwitchLine
        on={step.doerMayDrop}
        label={t('bs.editor.step_drop.sentence')}
        onToggle={() => draft.mutate((d) => setDoerMayDrop(d, step.id, !step.doerMayDrop))}
      >
        {t('bs.editor.step_drop.sentence')}
      </SwitchLine>
      {step.doerMayDrop && motives.length ? (
        <p className="se-conseq">
          {t('bs.editor.step_drop.motives', { motives: listOr(motives.map((m) => m.name)) })}
        </p>
      ) : null}
    </>
  );
}

// ---- field rows: where it starts, a protected branch, a long text as options ----

function initialValues(part: Part): { id: string; name: string }[] {
  if (part.kind === 'level') return LEVELS.map((l) => ({ id: l, name: initialName(l) }));
  if (part.kind === 'yesno') return ['yes', 'no'].map((v) => ({ id: v, name: initialName(v) }));
  return part.options.map((c) => ({ id: c.id, name: c.name }));
}

function initialLabel(part: Part): string {
  if (part.initial === undefined) return '';
  return initialValues(part).find((v) => v.id === part.initial)?.name ?? part.initial;
}

const cap = (s: string) => (s ? (s[0]?.toLocaleUpperCase() ?? '') + s.slice(1) : s);

export function FieldExtras({ part }: { part: Part }) {
  const { draft } = useEditor();
  const def = draft.def;
  const out: ReactNode[] = [];
  if (part.kind === 'choice' || part.kind === 'level' || part.kind === 'yesno')
    out.push(<InitialLine key="initial" part={part} />);
  if (part.kind === 'long') {
    const options = part.show === 'options';
    out.push(
      <div key="long">
        <span className="se-flab">{t('bs.editor.long.shows')}</span>
        <div className="se-radios">
          <ChipButton
            on={!options}
            onClick={() => draft.mutate((d) => setShow(d, part.id, 'text'))}
          >
            {t('bs.editor.long.text')}
          </ChipButton>
          <ChipButton
            on={options}
            onClick={() => draft.mutate((d) => setShow(d, part.id, 'options'))}
          >
            {t('bs.editor.long.options')}
          </ChipButton>
        </div>
      </div>,
    );
    if (options)
      out.push(
        <p key="longc" className="se-conseq">
          {tx('bs.editor.long.options_hint', {
            title: <span className="se-mono">### A · {t('bs.editor.long.name')}</span>,
          })}
        </p>,
      );
  }
  if (part.kind === 'branch') out.push(<GuardLines key="guard" part={part} def={def} />);
  return <>{out}</>;
}

function InitialLine({ part }: { part: Part }) {
  const { draft } = useEditor();
  const def = draft.def;
  const menu = useAnchor();
  const label = part.initial !== undefined ? initialLabel(part) : t('bs.editor.initial.none');
  return (
    <>
      <p className="se-sent se-sent-sm">
        {tx('bs.editor.initial.sentence', {
          value: (
            <span className="se-nw">
              <Blank label={cap(label)} open={menu.open} onPress={menu.toggle} />.
            </span>
          ),
        })}
      </p>
      <EdPop
        open={menu.open}
        anchor={menu.anchor}
        onClose={menu.close}
        label={t('bs.editor.initial.menu')}
      >
        <MenuLabel>{t('bs.editor.initial.menu')}</MenuLabel>
        <MenuItem
          on={part.initial === undefined}
          className="se-mi"
          onPick={() => draft.mutate((d) => setInitial(d, part.id, undefined))}
        >
          <span className="se-lbx">
            {cap(t('bs.editor.initial.none'))}
            <span className="se-gl2">{t('bs.editor.initial.none_gloss')}</span>
          </span>
        </MenuItem>
        {initialValues(part).map((v) => (
          <MenuItem
            key={v.id}
            on={part.initial === v.id}
            className="se-mi"
            onPick={() => draft.mutate((d) => setInitial(d, part.id, v.id))}
          >
            <span className="se-lbx">{cap(v.name)}</span>
          </MenuItem>
        ))}
      </EdPop>
      <p className="se-conseq">
        {part.initial !== undefined
          ? tx('bs.editor.initial.conseq', {
              item: def.item,
              part: <b>{part.name}</b>,
              value: <b>{initialLabel(part)}</b>,
            })
          : t('bs.editor.initial.empty')}
      </p>
    </>
  );
}

const REPO_KINDS = new Set(['text', 'url', 'choice']);

function GuardLines({ part, def }: { part: Part; def: BoardDefinition }) {
  const { draft, guardInstalled } = useEditor();
  const push = useAnchor();
  const repo = useAnchor();
  const guard = part.guard;
  const agentSteps = def.steps.filter((s) => s.doer !== 'you');
  const on = () =>
    draft.mutate((d) =>
      setGuard(d, part.id, !guard, guard ? [] : agentSteps.slice(-1).map((s) => s.id)),
    );
  const pushed = guard ? guard.push.filter((id) => stepIndex(def, id) >= 0) : [];
  const repoPart = guard?.repo ? def.parts[guard.repo] : undefined;
  const candidates = Object.values(def.parts).filter(
    (p) => p.id !== part.id && REPO_KINDS.has(p.kind) && p.name.trim(),
  );
  return (
    <>
      <SwitchLine on={!!guard} label={t('bs.editor.guard.switch')} onToggle={on}>
        {t('bs.editor.guard.switch')}
      </SwitchLine>
      {guard ? (
        <>
          <SetupStrip what="push" ref_={part.id} />
          <p className="se-sent se-sent-sm">
            {tx('bs.editor.guard.sentence', {
              steps: (
                <span className="se-nw">
                  <Blank
                    label={
                      pushed.length
                        ? listOf(pushed.map((id) => targetName(def, id)))
                        : t('bs.editor.guard.no_step')
                    }
                    open={push.open}
                    onPress={push.toggle}
                  />
                  ,
                </span>
              ),
              repo: (
                <span className="se-nw">
                  <Blank
                    label={repoPart ? repoPart.name : t('bs.editor.guard.no_field')}
                    open={repo.open}
                    onPress={repo.toggle}
                  />
                  .
                </span>
              ),
            })}
          </p>
          <EdPop
            open={push.open}
            anchor={push.anchor}
            onClose={push.close}
            label={t('bs.editor.guard.push_menu')}
            estimate={300}
          >
            <MenuLabel>{t('bs.editor.guard.push_menu')}</MenuLabel>
            {agentSteps.map((s) => (
              <MenuItem
                key={s.id}
                check
                on={guard.push.includes(s.id)}
                className="se-mi"
                onClick={() => draft.mutate((d) => toggleGuardPush(d, part.id, s.id))}
              >
                <span className="mk any">{t('bs.editor.lane.ag')}</span>
                <span className="se-lbx">
                  {unnamed(s.name)}
                  <span className="se-gl2">{whoWord(s.doer)}</span>
                </span>
              </MenuItem>
            ))}
            <MenuNote>{t('bs.editor.guard.push_note')}</MenuNote>
          </EdPop>
          <EdPop
            open={repo.open}
            anchor={repo.anchor}
            onClose={repo.close}
            label={t('bs.editor.guard.repo_menu')}
          >
            <MenuLabel>{t('bs.editor.guard.repo_menu')}</MenuLabel>
            <MenuItem
              on={!guard.repo}
              className="se-mi"
              onPick={() => draft.mutate((d) => setGuardRepo(d, part.id, undefined))}
            >
              <span className="se-lbx">
                {t('bs.editor.guard.no_field_title')}
                <span className="se-gl2">{t('bs.editor.guard.no_field_gloss')}</span>
              </span>
            </MenuItem>
            {candidates.length ? <MenuRule /> : null}
            {candidates.map((p) => (
              <MenuItem
                key={p.id}
                on={guard.repo === p.id}
                className="se-mi"
                onPick={() => draft.mutate((d) => setGuardRepo(d, part.id, p.id))}
              >
                <Glyph name={kindGlyph(p.kind)} />
                <span className="se-lbx">
                  {p.name}
                  <span className="se-gl2">{kindName(p.kind)}</span>
                </span>
              </MenuItem>
            ))}
          </EdPop>
          {guard.repo ? <SetupStrip what="repo" ref_={guard.repo} /> : null}
          <p className="se-conseq">{t('bs.editor.guard.frozen')}</p>
          <BaseLines part={part} def={def} />
          <p className={guardInstalled === false ? 'se-conseq warn' : 'se-conseq'}>
            {t('bs.editor.guard.hooks')}
          </p>
          {!pushed.length ? (
            <p className="se-conseq warn">
              {tx('bs.editor.guard.no_push', { part: <b>{part.name}</b> })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="se-conseq">{t('bs.editor.guard.off')}</p>
      )}
    </>
  );
}

// "También protege la rama base": agents push or merge into the base branch only the branch of an
// item that is Hecho; the person still can.
function BaseLines({ part, def }: { part: Part; def: BoardDefinition }) {
  const { draft } = useEditor();
  const base = part.guard?.base;
  const toggle = () =>
    draft.mutate((d) => setGuardBase(d, part.id, base === undefined ? 'main' : undefined));
  return (
    <>
      <SwitchLine
        on={base !== undefined}
        label={t('bs.editor.guard.base_switch')}
        onToggle={toggle}
      >
        {t('bs.editor.guard.base_switch')}
      </SwitchLine>
      {base !== undefined ? (
        <>
          <label className="se-fld se-base">
            <span className="se-flab">{t('bs.editor.guard.base_label')}</span>
            <input
              className="se-tx se-mono"
              value={base}
              maxLength={80}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) =>
                draft.mutate(
                  (d) => setGuardBase(d, part.id, e.target.value.trim()),
                  `base:${part.id}`,
                )
              }
              onBlur={() => draft.endBurst()}
            />
          </label>
          <p className="se-conseq">
            {tx('bs.editor.guard.base_on', {
              base: <span className="se-mono">{base || '…'}</span>,
              item: def.item,
            })}
          </p>
        </>
      ) : (
        <p className="se-conseq">{t('bs.editor.guard.base_off')}</p>
      )}
    </>
  );
}
