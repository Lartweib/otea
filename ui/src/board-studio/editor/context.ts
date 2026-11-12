import { createContext, useContext } from 'react';
import type { BoardDefinition, Selection } from '../../../../src/core/board/model.ts';
import type { ReadyDraft } from '../use-board-draft.ts';

// What every part of the editor shares: the draft (edited only through `mutate`), the project's
// agents, which handoff row is open, and the dialogs the bar and the cards open.

export type Agents = readonly { name: string; connected: boolean }[];

export type Dialogs = { practice: () => void; publish: () => void; discard: () => void };

export type Editor = {
  draft: ReadyDraft;
  agents: Agents;
  openRow: string | null;
  setOpenRow: (ref: string | null) => void;
  dialogs: Dialogs;
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
