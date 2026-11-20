// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { cambios, tareasDeRepo } from '../../../../src/core/board/testing.ts';
import { setupLeftOf } from '../home/setup-left.ts';
import type { PairIds } from '../pair.ts';
import type { ReadyDraft } from '../use-board-draft.ts';
import { type PairState, usePair } from './use-pair.ts';

// «N por configurar» on Studio's pair row reads what the editor's «Qué falta configurar» checklist
// reported for the pair's parent board. The editor must report it: the home has no other way to
// know.

const noop = () => {};

function draft(id: string, def: BoardDefinition, published: boolean): ReadyDraft {
  return {
    status: 'ready',
    record: {
      id,
      collection: published ? id : null,
      builtin: false,
      live: published
        ? { version: 1, publishedAt: '2026-11-01T00:00:00Z', publishedBy: 'you', definition: def }
        : null,
      draft: null,
      versions: [],
    },
    def,
    baseVersion: published ? 1 : null,
    problems: [],
    save: { kind: 'saved' },
    canUndo: false,
    canRedo: false,
    depth: { undo: 0, redo: 0 },
    selection: { kind: 'about' },
    select: noop,
    reveal: noop,
    revealed: 0,
    mutate: noop,
    endBurst: noop,
    undo: noop,
    redo: noop,
    retrySave: noop,
    reload: noop,
  };
}

// A pair a template set made, as the editor opens it.
function repos(ids: PairIds, published = false) {
  const parent = cambios();
  const child = tareasDeRepo();
  parent.template = 'repos';
  child.template = 'repos';
  return { parent: draft(ids.parent, parent, published), child: draft(ids.child, child, false) };
}

let root: Root;
let state: PairState | null = null;

function Workspace({ ids, drafts }: { ids: PairIds; drafts: ReturnType<typeof repos> }) {
  state = usePair(ids, drafts.parent, drafts.child, 'parent');
  return null;
}

const open = (ids: PairIds, drafts: ReturnType<typeof repos>) =>
  act(() => root.render(<Workspace ids={ids} drafts={drafts} />));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  state = null;
});

describe('the editor tells the home how much is left to set up', () => {
  it('reports the open rows of «Qué falta configurar» for the parent board, as you tick them', () => {
    const ids = { parent: 'cambios-a', child: 'tareas-a', always: false };
    open(ids, repos(ids));
    expect(state?.setup?.rows).toHaveLength(6);
    expect(setupLeftOf('cambios-a')).toBe(6);

    act(() => state?.setup?.ok('doer:parent:sanalyse'));
    expect(setupLeftOf('cambios-a')).toBe(5);
    expect(setupLeftOf('tareas-a')).toBe(0);
  });

  it('reports nothing left once the checklist is hidden', () => {
    const ids = { parent: 'cambios-b', child: 'tareas-b', always: false };
    open(ids, repos(ids));
    expect(setupLeftOf('cambios-b')).toBe(6);

    act(() => state?.setup?.hide());
    expect(setupLeftOf('cambios-b')).toBe(0);
  });

  it('reports nothing left once the parent is published, where the checklist no longer shows', () => {
    const ids = { parent: 'cambios-c', child: 'tareas-c', always: false };
    open(ids, repos(ids));
    expect(setupLeftOf('cambios-c')).toBe(6);

    open(ids, repos(ids, true));
    expect(state?.setup).toBeNull();
    expect(setupLeftOf('cambios-c')).toBe(0);
  });
});
