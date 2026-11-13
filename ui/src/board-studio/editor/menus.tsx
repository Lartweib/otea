import { type ReactNode, useState } from 'react';
import { backWaysOf, waysOf } from '../../../../src/core/board/engine.ts';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import {
  DONE,
  type Doer,
  type Reviewer,
  SAME,
  type Step,
  type Target,
} from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import { AgentMark } from '../../kit/Marks.tsx';
import { MenuItem, MenuLabel, MenuNote, MenuRule } from '../../kit/pop/Menu.tsx';
import { Pop, type PopEdge } from '../../kit/pop/Pop.tsx';
import { Chev } from './glyphs.tsx';
import { whoTitle } from './who.ts';

// The blanks of the card's sentences and the menus they open (mock 80-flows.js whoMenu, wayMenu,
// backMenu): a word you press to choose, the choice showing first, then the menu closing.

// Below its trigger when it fits, above it when the room below is short and there is more above:
// a pop opened near the foot of the screen never unrolls out of sight.
export function edgeFor(anchor: HTMLElement | null, estimate: number): PopEdge {
  if (!anchor) return 'top';
  const r = anchor.getBoundingClientRect();
  const below = window.innerHeight - r.bottom;
  return below < estimate + 24 && r.top > below ? 'bottom' : 'top';
}

export function placeBy(el: HTMLElement, anchor: HTMLElement, edge: PopEdge, alignRight = false) {
  const r = anchor.getBoundingClientRect();
  const surf = el.querySelector<HTMLElement>(':scope > .psurf');
  if (surf) {
    surf.style.maxHeight = '';
    surf.style.overflow = '';
  }
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const left = Math.max(
    16,
    Math.min(window.innerWidth - w - 16, alignRight ? r.right - w : r.left),
  );
  el.style.left = `${left}px`;
  if (edge === 'top') {
    const top = r.bottom + 6;
    el.style.top = `${top}px`;
    if (surf && top + h > window.innerHeight - 12) {
      surf.style.maxHeight = `${window.innerHeight - top - 22}px`;
      surf.style.overflow = 'auto';
    }
    return;
  }
  const room = r.top - 18;
  if (surf && h > room) {
    surf.style.maxHeight = `${room - 10}px`;
    surf.style.overflow = 'auto';
  }
  el.style.top = `${Math.max(12, r.top - el.offsetHeight - 6)}px`;
}

type EdPopProps = {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  alignRight?: boolean;
  // About how tall it opens, to choose below or above.
  estimate?: number;
  role?: 'menu' | 'dialog';
  children: ReactNode;
};

export function EdPop({
  anchor,
  open,
  onClose,
  label,
  className,
  alignRight = false,
  estimate = 260,
  role = 'menu',
  children,
}: EdPopProps) {
  const [edge, setEdge] = useState<PopEdge>('top');
  const [was, setWas] = useState<HTMLElement | null>(null);
  if (anchor !== was) {
    setWas(anchor);
    if (anchor) setEdge(edgeFor(anchor, estimate));
  }
  return (
    <Pop
      open={open}
      anchor={anchor}
      edge={edge}
      role={role}
      place={(el) => anchor && placeBy(el, anchor, edge, alignRight)}
      onClose={onClose}
      label={label}
      className={className ? `se-pop ${className}` : 'se-pop'}
    >
      {children}
    </Pop>
  );
}

export function useAnchor() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return {
    anchor,
    open: anchor !== null,
    toggle: (el: HTMLElement) => setAnchor((was) => (was ? null : el)),
    close: () => setAnchor(null),
  };
}

type BlankProps = {
  label: ReactNode;
  you?: boolean;
  open: boolean;
  onPress: (el: HTMLElement) => void;
  ariaLabel?: string;
};

export function Blank({ label, you = false, open, onPress, ariaLabel }: BlankProps) {
  return (
    <button
      type="button"
      className={you ? 'se-blank you' : 'se-blank'}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={ariaLabel}
      onClick={(e) => onPress(e.currentTarget)}
    >
      {label}
      <Chev />
    </button>
  );
}

function whoMark(who: Doer | Reviewer) {
  if (who === 'you') return <AgentMark you decorative />;
  if (who === 'any') return <span className="mk any">{t('bs.editor.lane.ag')}</span>;
  return <AgentMark decorative />;
}

// Who does a step (you or any agent), or who reviews it (nobody, you, or any agent but the one that
// did it). A step names no agent: whichever agent is free takes it.
export function WhoMenu({
  kind,
  current,
  anchor,
  open,
  onClose,
  onPick,
}: {
  kind: 'doer' | 'reviewer';
  current: Doer | Reviewer;
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onPick: (who: Doer | Reviewer) => void;
}) {
  const options: { who: Doer | Reviewer; gloss: string }[] =
    kind === 'doer'
      ? [
          { who: 'you', gloss: t('bs.editor.who.you_doer') },
          { who: 'any', gloss: t('bs.editor.who.any_doer') },
        ]
      : [
          { who: 'none', gloss: t('bs.editor.who.none_rev') },
          { who: 'you', gloss: t('bs.editor.who.you_rev') },
          { who: 'any', gloss: t('bs.editor.who.any_rev') },
        ];
  const label = kind === 'doer' ? t('bs.editor.who.doer_label') : t('bs.editor.who.rev_label');
  return (
    <EdPop open={open} anchor={anchor} onClose={onClose} label={label} estimate={320}>
      <MenuLabel>{label}</MenuLabel>
      {options.map(({ who, gloss }) => (
        <MenuItem key={who} on={who === current} className="se-mi" onPick={() => onPick(who)}>
          {whoMark(who)}
          <span className="se-lbx">
            {whoTitle(who, kind)}
            <span className="se-gl2">{gloss}</span>
          </span>
        </MenuItem>
      ))}
    </EdPop>
  );
}

// Another way out: a later step or Hecho, not yet a way; and, when adding, an earlier step to take
// it back to ("o regresarlo a…", or "o devolverlo a…" on your own step).
export function WayMenu({
  def,
  step,
  replace,
  anchor,
  open,
  onClose,
  onPick,
  targetName,
}: {
  def: BoardDefinition;
  step: Step;
  replace?: Target | undefined;
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onPick: (target: Target, back: boolean) => void;
  targetName: (t: Target) => string;
}) {
  const ways = waysOf(def, step.id);
  const backs = backWaysOf(def, step.id);
  const index = def.steps.findIndex((s) => s.id === step.id);
  const later = [...def.steps.slice(index + 1).map((s) => s.id), DONE].filter(
    (target) => !ways.includes(target) || target === replace,
  );
  const earlier = replace
    ? []
    : def.steps.slice(0, Math.max(0, index)).filter((s) => !backs.includes(s.id));
  const you = step.doer === 'you';
  return (
    <EdPop open={open} anchor={anchor} onClose={onClose} label={t('bs.editor.ways.menu')}>
      {later.length ? <MenuLabel>{t('bs.editor.ways.menu')}</MenuLabel> : null}
      {later.map((target) => (
        <MenuItem
          key={target}
          on={target === replace}
          className="se-mi"
          onPick={() => onPick(target, false)}
        >
          <span className="se-lbx">
            {targetName(target)}
            <span className="se-gl2">
              {target === DONE ? t('bs.editor.ways.to_done') : t('bs.editor.ways.to_step')}
            </span>
          </span>
        </MenuItem>
      ))}
      {earlier.length && later.length ? <MenuRule /> : null}
      {earlier.length ? (
        <MenuLabel>
          {t(you ? 'bs.editor.back_way.menu_you' : 'bs.editor.back_way.menu_agent')}
        </MenuLabel>
      ) : null}
      {earlier.map((s) => (
        <MenuItem key={s.id} className="se-mi" onPick={() => onPick(s.id, true)}>
          <span className="se-lbx">
            ↩ {s.name.trim() || t('bs.editor.route.unnamed')}
            <span className="se-gl2">
              {t(you ? 'bs.editor.back_way.gloss_you' : 'bs.editor.back_way.gloss_agent')}
            </span>
          </span>
        </MenuItem>
      ))}
    </EdPop>
  );
}

// Where a send-back lands: this same step, or an earlier one.
export function BackMenu({
  def,
  step,
  anchor,
  open,
  onClose,
  onPick,
}: {
  def: BoardDefinition;
  step: Step;
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onPick: (back: string) => void;
}) {
  const index = def.steps.findIndex((s) => s.id === step.id);
  const options = [
    { id: SAME, name: t('bs.editor.back.same'), gloss: t('bs.editor.back.same_gloss') },
    ...def.steps.slice(0, Math.max(0, index)).map((s) => ({
      id: s.id,
      name: s.name.trim() || t('bs.editor.route.unnamed'),
      gloss: t('bs.editor.back.earlier_gloss'),
    })),
  ];
  return (
    <EdPop open={open} anchor={anchor} onClose={onClose} label={t('bs.editor.back.menu')}>
      <MenuLabel>{t('bs.editor.back.menu')}</MenuLabel>
      {options.map((o) => (
        <MenuItem key={o.id} on={step.back === o.id} className="se-mi" onPick={() => onPick(o.id)}>
          <span className="se-lbx">
            {o.name}
            <span className="se-gl2">{o.gloss}</span>
          </span>
        </MenuItem>
      ))}
      <MenuNote>{t('bs.editor.back.note')}</MenuNote>
    </EdPop>
  );
}
