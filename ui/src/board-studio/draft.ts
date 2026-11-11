import type { BoardDefinition } from '../../../src/core/board/model.ts';

// The draft as the editor holds it: the definition, and the undo and redo history of every edit
// inside it (Deshacer / Rehacer in the bar). A typing burst is one step: edits that carry the same
// burst key coalesce until endBurst (blur, or another kind of edit). Pure: the hook in
// use-board-draft.ts keeps it in React state and saves it.

export type DraftState = {
  def: BoardDefinition;
  undo: readonly BoardDefinition[];
  redo: readonly BoardDefinition[];
  burst: string | null;
};

const LIMIT = 100;

export function startDraft(def: BoardDefinition): DraftState {
  return { def: structuredClone(def), undo: [], redo: [], burst: null };
}

// Applies `change` to a copy of the draft. `burst` names a typing burst (a field being typed in).
export function edit(
  state: DraftState,
  change: (def: BoardDefinition) => void,
  burst: string | null = null,
): DraftState {
  const next = structuredClone(state.def);
  change(next);
  if (JSON.stringify(next) === JSON.stringify(state.def)) return state;
  const coalesce = burst !== null && burst === state.burst;
  return {
    def: next,
    undo: coalesce ? state.undo : [...state.undo, state.def].slice(-LIMIT),
    redo: [],
    burst,
  };
}

export function endBurst(state: DraftState): DraftState {
  return state.burst === null ? state : { ...state, burst: null };
}

export const canUndo = (state: DraftState) => state.undo.length > 0;
export const canRedo = (state: DraftState) => state.redo.length > 0;

export function undo(state: DraftState): DraftState {
  const previous = state.undo.at(-1);
  if (!previous) return state;
  return {
    def: previous,
    undo: state.undo.slice(0, -1),
    redo: [...state.redo, state.def],
    burst: null,
  };
}

export function redo(state: DraftState): DraftState {
  const next = state.redo.at(-1);
  if (!next) return state;
  return {
    def: next,
    undo: [...state.undo, state.def],
    redo: state.redo.slice(0, -1),
    burst: null,
  };
}

// Where saving stands, for the bar: never a silent failure.
export type SaveStatus =
  | { kind: 'saved' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'failed'; message: string };

export type Saver = {
  queue: (def: BoardDefinition) => void;
  // Saves what is queued (or retries a failed save) now.
  flush: () => Promise<void>;
  cancel: () => void;
};

// Saves the latest queued draft `delay` ms after the last edit, one save at a time.
export function createSaver(options: {
  delay: number;
  save: (def: BoardDefinition) => Promise<void>;
  onStatus: (status: SaveStatus) => void;
}): Saver {
  let latest: BoardDefinition | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let failed: BoardDefinition | null = null;

  const run = async (): Promise<void> => {
    if (running) await running;
    const def = latest ?? failed;
    latest = null;
    if (!def) return;
    options.onStatus({ kind: 'saving' });
    running = options
      .save(def)
      .then(() => {
        failed = null;
        options.onStatus(latest ? { kind: 'pending' } : { kind: 'saved' });
      })
      .catch((error: unknown) => {
        failed = def;
        const message = error instanceof Error ? error.message : String(error);
        options.onStatus({ kind: 'failed', message });
      })
      .finally(() => {
        running = null;
      });
    await running;
  };

  return {
    queue(def) {
      latest = def;
      options.onStatus({ kind: 'pending' });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, options.delay);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      await run();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      latest = null;
    },
  };
}
