import { describe, expect, it, vi } from 'vitest';
import { creatures } from '../../../src/core/board/testing.ts';
import { canRedo, canUndo, createSaver, edit, endBurst, redo, startDraft, undo } from './draft.ts';

describe('the draft history', () => {
  it('undoes and redoes every edit, never touching the definition it started from', () => {
    const start = creatures();
    let state = startDraft(start);
    state = edit(state, (def) => {
      def.name = 'Bestias';
    });
    state = edit(state, (def) => {
      def.item = 'Bestia';
    });
    expect(start.name).toBe('Criaturas');
    expect(canUndo(state)).toBe(true);
    state = undo(state);
    expect([state.def.name, state.def.item]).toEqual(['Bestias', 'Criatura']);
    state = undo(state);
    expect(state.def.name).toBe('Criaturas');
    expect(canUndo(state)).toBe(false);
    state = redo(redo(state));
    expect([state.def.name, state.def.item]).toEqual(['Bestias', 'Bestia']);
    expect(canRedo(state)).toBe(false);
  });

  it('keeps a typing burst as one step, until the burst ends', () => {
    let state = startDraft(creatures());
    for (const name of ['B', 'Be', 'Bes']) {
      state = edit(
        state,
        (def) => {
          def.name = name;
        },
        'name',
      );
    }
    state = endBurst(state);
    state = edit(
      state,
      (def) => {
        def.name = 'Best';
      },
      'name',
    );
    expect(undo(state).def.name).toBe('Bes');
    expect(undo(undo(state)).def.name).toBe('Criaturas');
  });

  it('drops the redo once a new edit is made', () => {
    let state = edit(startDraft(creatures()), (def) => {
      def.name = 'A';
    });
    state = undo(state);
    state = edit(state, (def) => {
      def.name = 'B';
    });
    expect(canRedo(state)).toBe(false);
  });

  it('ignores an edit that changes nothing', () => {
    const state = edit(startDraft(creatures()), () => {});
    expect(canUndo(state)).toBe(false);
  });
});

describe('createSaver', () => {
  it('saves the latest draft once the edits settle, and says how it went', async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const states: string[] = [];
    const saver = createSaver({
      delay: 500,
      save: async (def) => {
        saved.push(def.name);
      },
      onStatus: (status) => states.push(status.kind),
    });
    saver.queue({ ...creatures(), name: 'A' });
    saver.queue({ ...creatures(), name: 'AB' });
    await vi.advanceTimersByTimeAsync(600);
    expect(saved).toEqual(['AB']);
    expect(states).toEqual(['pending', 'pending', 'saving', 'saved']);
    vi.useRealTimers();
  });

  it('keeps the failure and its reason, and saves again on retry', async () => {
    vi.useFakeTimers();
    let fail = true;
    const statuses: { kind: string; message?: string }[] = [];
    const saver = createSaver({
      delay: 10,
      save: async () => {
        if (fail) throw new Error('El servidor no responde');
      },
      onStatus: (status) => statuses.push(status),
    });
    saver.queue(creatures());
    await vi.advanceTimersByTimeAsync(20);
    expect(statuses.at(-1)).toEqual({ kind: 'failed', message: 'El servidor no responde' });
    fail = false;
    await saver.flush();
    expect(statuses.at(-1)).toEqual({ kind: 'saved' });
    vi.useRealTimers();
  });
});
