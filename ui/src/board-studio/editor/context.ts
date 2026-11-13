import { createContext, useContext } from 'react';
import type { BoardDefinition, Selection } from '../../../../src/core/board/model.ts';
import type { Problem } from '../../../../src/core/board/problems.ts';
import type { BoardSummary } from '../api.ts';
import type { PairIds, PairRole } from '../pair.ts';
import type { ReadyDraft } from '../use-board-draft.ts';
import type { SetupRow } from './setup.ts';

// What every part of the editor shares: the draft (edited only through `mutate`), the project's
// boards, which handoff row is open, the dialogs the bar and the cards open and, when
// the board is joined to another one, the pair it is edited with.

export type Dialogs = { practice: () => void; publish: () => void; discard: () => void };

// «Qué falta configurar», as the head and the cards show it.
export type SetupView = {
  rows: SetupRow[];
  errors: { role: PairRole; problem: Problem }[];
  ok: (k: string) => void;
  go: (k: string) => void;
  goError: (index: number) => void;
  hidden: boolean;
  hide: () => void;
};

// A joined pair, edited in one workspace: both drafts, the one on screen, and how to switch.
export type PairView = {
  ids: PairIds;
  role: PairRole;
  drafts: Readonly<Record<PairRole, ReadyDraft>>;
  // Switches board in place and selects a stop of it (or the one it had).
  switchTo: (role: PairRole, sel?: Selection) => void;
  setup: SetupView | null;
};

export type Editor = {
  draft: ReadyDraft;
  openRow: string | null;
  setOpenRow: (ref: string | null) => void;
  dialogs: Dialogs;
  // The project's boards, as the home lists them (the draft, or else the live definition).
  boards: readonly BoardSummary[];
  pair?: PairView;
  // A board a template set made with this one, that stays apart (Producto): the bar opens it.
  twin?: BoardSummary;
  // Whether any repository of the project has Otea's guard on its pushes; unknown while loading.
  guardInstalled?: boolean | undefined;
};

export const EditorContext = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('useEditor outside the editor');
  return editor;
}

// The card a selection opens: a part opens the card it belongs to.
export type CardSel =
  | { kind: 'step'; id: string }
  | { kind: 'form' }
  | { kind: 'done' }
  | { kind: 'about' }
  | { kind: 'anytime' };

export function cardOf(def: BoardDefinition, sel: Selection): CardSel {
  if (sel.kind === 'step') return def.steps.some((s) => s.id === sel.id) ? sel : firstCard(def);
  if (sel.kind !== 'part') return sel;
  if (sel.step && def.steps.some((s) => s.id === sel.step)) return { kind: 'step', id: sel.step };
  if (sel.id === 'title' || def.form.some((f) => f.ref === sel.id)) return { kind: 'form' };
  const step = def.steps.find((s) => s.hand.some((h) => h.ref === sel.id));
  if (step) return { kind: 'step', id: step.id };
  if (def.anytime.includes(sel.id)) return { kind: 'anytime' };
  return firstCard(def);
}

function firstCard(def: BoardDefinition): CardSel {
  const first = def.steps[0];
  return first ? { kind: 'step', id: first.id } : { kind: 'form' };
}

export const cardKey = (c: CardSel) => (c.kind === 'step' ? c.id : c.kind);
