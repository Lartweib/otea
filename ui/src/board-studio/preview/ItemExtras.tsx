import { type ReactNode, useRef, useState } from 'react';
import { gateAt, type Phase } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  guardedBranch,
  type ListView,
  MOTIVE,
  PARTS,
  partOf,
  STEP,
  type Step,
} from '../../../../src/core/board/model.ts';
import { t, tx } from '../../i18n/i18n.ts';
import { MenuItem, MenuLabel } from '../../kit/pop/Menu.tsx';
import { Pop } from '../../kit/pop/Pop.tsx';
import type { Look } from '../../lanes/looks.ts';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import type { ReadyDraft } from '../use-board-draft.ts';
import { groupOptions, setListAs, setListGroup } from './arrange.ts';
import { sampleParts } from './practice.ts';
import { sampleTitle, sampleValue } from './samples.ts';
import { plainToast } from './toasts.tsx';

// What Lo que ves adds for the new capabilities: the Rondas and Partes tiles, the branch strip under
// the buttons, and in Acomodar's list-row place the sentence that sets how the published list looks.

export const placeLabel = (ref: string): string =>
  t(ref === PARTS ? 'bs.preview.place.parts' : 'bs.preview.place.rounds');

export const placeOrigin = (ref: string): string =>
  t(ref === PARTS ? 'bs.preview.place.parts.from' : 'bs.preview.place.rounds.from');

// Rondas: two rounds with neutral notes (F4); Partes: the sample parts, every one Hecho during the
// review of a step that waits for them (F5).
export function PlaceValue({
  def,
  place,
  child,
  allDone,
}: {
  def: BoardDefinition;
  place: string;
  child?: BoardDefinition | undefined;
  allDone: boolean;
}) {
  if (place !== PARTS)
    return (
      <div className="bsp-rounds">
        <div className="rd">
          <span className="rk">{t('bs.preview.place.round', { n: 1 })}</span>
          <span className="rs">{t('bs.preview.place.sentBack')}</span>
          <p>{t('bs.preview.place.note1')}</p>
        </div>
        <div className="rd on">
          <span className="rk">{t('bs.preview.place.round', { n: 2 })}</span>
          <span className="rs">{t('bs.preview.place.thisRound')}</span>
          <p>{t('bs.preview.place.note2')}</p>
        </div>
      </div>
    );
  const on = child ?? def;
  const parts = sampleParts(def, child);
  const looks: Look[] = ['yours', 'working', 'done'];
  return (
    <div className="bsp-plist">
      {parts.map((part, k) => {
        const done = allDone || part.closed;
        return (
          <div className="prow" key={part.id}>
            <span className="pmain">
              <NodeGlyph look={done ? 'done' : (looks[k] ?? 'working')} size={16} />
              <span className="pid">{part.id}</span>
              <span className="pt2">{sampleTitle(on, k)}</span>
              <span className="pst">{done ? t('bs.done') : (part.step ?? '')}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// The protected branch where the sample item stands: it can be pushed, it is frozen while it is
// reviewed, or it takes no pushes in this step (gateAt).
export function BranchStrip({ def, step, at }: { def: BoardDefinition; step: Step; at: Phase }) {
  const branch = guardedBranch(def);
  if (!branch) return null;
  const answer = gateAt(def, { step: step.id, phase: at }, 'push');
  const state = answer.allowed ? 'ok' : answer.why === 'review' ? 'frozen' : 'off';
  const words =
    state === 'ok'
      ? t('bs.preview.branch.push')
      : state === 'frozen'
        ? t(step.reviewer === 'you' ? 'bs.preview.branch.frozenYou' : 'bs.preview.branch.frozen')
        : t('bs.preview.branch.noPush', { step: step.name });
  const repo = branch.guard.repo ? partOf(def, branch.guard.repo) : undefined;
  return (
    <div className={`bsp-bstrip ${state}`}>
      <svg viewBox="0 0 16 16" aria-hidden="true" className="ic">
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <circle cx="5" cy="3.5" r="1.6" />
          <circle cx="5" cy="12.5" r="1.6" />
          <circle cx="11" cy="6" r="1.6" />
          <path d="M5 5.1v5.8M11 7.6c0 2.4-2.6 2.6-5.4 3.6" />
        </g>
      </svg>
      {/* The branch tile's own sample, so the strip and the tile name the same branch. */}
      <span className="mono">{sampleValue(branch, branch.name.length)}</span>
      {repo ? (
        <span className="pvtag">
          {t('bs.preview.branch.in', { repo: t('bs.preview.branch.repo') })}
        </span>
      ) : null}
      <span className="sep">·</span>
      <span>{words}</span>
    </div>
  );
}

const groupName = (def: BoardDefinition, group: string | undefined): string => {
  if (group === undefined) return t('bs.preview.list.nothing');
  if (group === STEP) return t('bs.preview.list.step');
  if (group === MOTIVE) return t('bs.preview.list.motive');
  return partOf(def, group)?.name ?? '…';
};

function Blank({
  label,
  value,
  menu,
}: {
  label: string;
  value: string;
  menu: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="bsp-blank"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {value}
        <svg viewBox="0 0 16 16" aria-hidden="true" className="bsp-chev">
          <path d="M4.5 6.5l3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      <Pop
        open={open}
        anchor={button.current}
        place="below-left"
        label={label}
        onClose={() => setOpen(false)}
      >
        {menu(() => setOpen(false))}
      </Pop>
    </>
  );
}

// "La lista se ve como [Lista ▾] y agrupa por [nada ▾]." It writes `def.list`; the toast offers
// Deshacer, as every Acomodar move does.
export function ListSentence({ draft }: { draft: ReadyDraft }) {
  const { def } = draft;
  const list: ListView = def.list;
  const pickAs = (as: ListView['as']) => {
    draft.mutate((d) => setListAs(d, as));
    plainToast(
      t(as === 'table' ? 'bs.preview.list.toast.table' : 'bs.preview.list.toast.list'),
      draft.undo,
    );
  };
  const pickGroup = (group: string | undefined) => {
    draft.mutate((d) => setListGroup(d, group));
    plainToast(t('bs.preview.list.toast.group', { group: groupName(def, group) }), draft.undo);
  };
  const as = (
    <Blank
      label={t('bs.preview.list.asLabel')}
      value={t(list.as === 'table' ? 'bs.preview.list.table' : 'bs.preview.list.list')}
      menu={(close) => (
        <>
          {(['list', 'table'] as const).map((value) => (
            <MenuItem
              key={value}
              on={list.as === value}
              small={t(
                value === 'table' ? 'bs.preview.list.table.gloss' : 'bs.preview.list.list.gloss',
              )}
              onPick={() => {
                close();
                pickAs(value);
              }}
            >
              {t(value === 'table' ? 'bs.preview.list.table' : 'bs.preview.list.list')}
            </MenuItem>
          ))}
        </>
      )}
    />
  );
  const group = (
    <Blank
      label={t('bs.preview.list.groupLabel')}
      value={groupName(def, list.group)}
      menu={(close) => (
        <>
          <MenuLabel>{t('bs.preview.list.groupBy')}</MenuLabel>
          {[undefined, ...groupOptions(def)].map((value) => (
            <MenuItem
              key={value ?? ''}
              on={list.group === value}
              onPick={() => {
                close();
                pickGroup(value);
              }}
            >
              {groupName(def, value)}
            </MenuItem>
          ))}
        </>
      )}
    />
  );
  return <p className="bsp-zsent">{tx('bs.preview.list.sentence', { as, group })}</p>;
}
