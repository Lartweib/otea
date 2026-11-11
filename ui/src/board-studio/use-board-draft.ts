import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardDefinition, Selection } from '../../../src/core/board/model.ts';
import { type Problem, problemsOf } from '../../../src/core/board/problems.ts';
import { type BoardRecord, fetchBoard, saveDraft } from './api.ts';
import {
  canRedo,
  canUndo,
  createSaver,
  type DraftState,
  edit,
  endBurst,
  redo,
  type SaveStatus,
  startDraft,
  undo,
} from './draft.ts';

// The board the editor and the preview work on, shared by both: loaded once, edited through
// `mutate` (each call one undo step, or one typing burst), saved whole a moment after the edits
// settle, its problems computed on every change by the same core function the server uses. A
// failed load or save says why; nothing is swallowed.

export type ReadyDraft = {
  status: 'ready';
  record: BoardRecord;
  // The definition on screen: the draft, or the live version until the first edit.
  def: BoardDefinition;
  // The live version the draft is based on (null for a board never published).
  baseVersion: number | null;
  problems: Problem[];
  save: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  selection: Selection;
  select: (selection: Selection) => void;
  mutate: (change: (def: BoardDefinition) => void, burst?: string) => void;
  endBurst: () => void;
  undo: () => void;
  redo: () => void;
  retrySave: () => void;
  reload: () => void;
};

export type BoardDraft =
  | { status: 'loading' }
  | { status: 'failed'; message: string; retry: () => void }
  | ReadyDraft;

export type DraftOptions = {
  // The project's agents, for "no está conectado todavía".
  agents: readonly { name: string; connected: boolean }[];
  // The names of the project's other boards.
  takenNames: readonly string[];
  // How long edits settle before a save.
  delay?: number;
};

function firstSelection(def: BoardDefinition): Selection {
  const first = def.steps[0];
  return first ? { kind: 'step', id: first.id } : { kind: 'form' };
}

export function useBoardDraft(id: string, options: DraftOptions): BoardDraft {
  const [load, setLoad] = useState<
    | { status: 'loading' }
    | { status: 'failed'; message: string }
    | { status: 'ready'; record: BoardRecord }
  >({ status: 'loading' });
  const [state, setState] = useState<DraftState | null>(null);
  const [save, setSave] = useState<SaveStatus>({ kind: 'saved' });
  const [selection, setSelection] = useState<Selection>({ kind: 'form' });
  const [attempt, setAttempt] = useState(0);
  const base = useRef<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new attempt loads the board again
  useEffect(() => {
    const abort = new AbortController();
    setLoad({ status: 'loading' });
    fetchBoard(id, abort.signal)
      .then(({ record }) => {
        const def = (record.draft ?? record.live)?.definition;
        if (!def) throw new Error(id);
        base.current = record.draft ? record.draft.baseVersion : (record.live?.version ?? null);
        setState(startDraft(def));
        setSelection(firstSelection(def));
        setLoad({ status: 'ready', record });
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        setLoad({
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => abort.abort();
  }, [id, attempt]);

  const saver = useMemo(
    () =>
      createSaver({
        delay: options.delay ?? 600,
        save: async (def) => {
          const saved = await saveDraft(id, def, base.current);
          setLoad({ status: 'ready', record: saved.record });
        },
        onStatus: setSave,
      }),
    [id, options.delay],
  );
  useEffect(() => () => void saver.flush(), [saver]);

  const mutate = useCallback(
    (change: (def: BoardDefinition) => void, burst?: string) =>
      setState((current) => {
        if (!current) return current;
        const next = edit(current, change, burst ?? null);
        if (next !== current) saver.queue(next.def);
        return next;
      }),
    [saver],
  );
  const step = useCallback(
    (move: (state: DraftState) => DraftState) =>
      setState((current) => {
        if (!current) return current;
        const next = move(current);
        if (next.def !== current.def) saver.queue(next.def);
        return next;
      }),
    [saver],
  );

  const { agents, takenNames } = options;
  const problems = useMemo(
    () => (state ? problemsOf(state.def, { agents, takenNames }) : []),
    [state, agents, takenNames],
  );

  if (load.status === 'loading') return { status: 'loading' };
  if (load.status === 'failed' || !state)
    return {
      status: 'failed',
      message: load.status === 'failed' ? load.message : '',
      retry: () => setAttempt((n) => n + 1),
    };
  return {
    status: 'ready',
    record: load.record,
    def: state.def,
    baseVersion: base.current,
    problems,
    save,
    canUndo: canUndo(state),
    canRedo: canRedo(state),
    selection,
    select: setSelection,
    mutate,
    endBurst: () => setState((current) => (current ? endBurst(current) : current)),
    undo: () => step(undo),
    redo: () => step(redo),
    retrySave: () => void saver.flush(),
    reload: () => setAttempt((n) => n + 1),
  };
}
