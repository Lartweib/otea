import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { partOf } from '../core/board/model.ts';
import { draftToStartFrom, proposeBoardChange, submitAgentDraft } from './agent-draft.ts';
import {
  addBoard,
  ensureRequestsBoard,
  getBoardRecord,
  publishBoard,
  saveDraft,
} from './boards.ts';
import { getItem } from './items.ts';
import { liveBoardOf } from './next.ts';
import type { Project } from './project.ts';
import { memoryContext, projectOf } from './testing.ts';

const kiln = { kind: 'agent' as const, name: 'kiln' };
const you = { kind: 'human' as const, name: 'human' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 19, 9, 0, tick++)).toISOString();

// P4-6: an agent asked to add a field to a published board could only say it can't. It proposes
// the change as a board draft on a Pedido it holds, as for a new board; the person publishes it.
describe('an agent proposing a change to a published board', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function project(): Project {
    const root = mkdtempSync(join(tmpdir(), 'otea-board-change-'));
    dirs.push(root);
    const ctx = projectOf(root, memoryContext());
    ensureRequestsBoard(ctx, 'es', now);
    addBoard(ctx, { name: 'Tareas', template: 'tasks', lang: 'es', by: you }, now);
    return ctx;
  }

  it('leaves the live board as it is and waits for the draft on a Pedido the agent holds', () => {
    const ctx = project();
    const live = liveBoardOf(ctx, 'Tareas');
    const made = proposeBoardChange(
      ctx,
      {
        board: 'tareas',
        need: 'Esfuerzo e Impacto para la Matriz',
        lang: 'es',
        actor: kiln,
        channel: 'cli',
      },
      now,
    );
    const pedido = getItem(ctx, made.item, now);
    expect(pedido.title).toBe('Cambiar el tablero Tareas');
    expect(pedido.lease?.holder).toBe('kiln');
    expect(made.board.id).toBe(live?.id);
    expect(liveBoardOf(ctx, 'Tareas')?.version).toBe(live?.version);
    // It starts from the board as published.
    expect(draftToStartFrom(ctx, made.item)).toEqual(live?.def);
  });

  it('takes the field the agent adds into the draft, for the person to publish', () => {
    const ctx = project();
    const made = proposeBoardChange(
      ctx,
      { board: 'Tareas', need: 'Esfuerzo', lang: 'es', actor: kiln, channel: 'cli' },
      now,
    );
    const start = draftToStartFrom(ctx, made.item);
    start.parts.feffort = { id: 'feffort', name: 'Esfuerzo', kind: 'level', hint: '', options: [] };
    start.anytime = [...start.anytime, 'feffort'];
    submitAgentDraft(
      ctx,
      { id: made.item, text: JSON.stringify(start), actor: kiln, channel: 'cli' },
      now,
    );
    const record = getBoardRecord(ctx, made.board.id);
    expect(record.draft?.agentNote).toContain('+ campo Esfuerzo');
    publishBoard(ctx, made.board.id, { moves: {}, by: you, closeRequest: true }, now);
    const def = liveBoardOf(ctx, 'Tareas')?.def;
    expect(def && partOf(def, 'feffort')?.name).toBe('Esfuerzo');
    expect(getItem(ctx, made.item, now).state).toBe('done');
  });

  it('starts from the draft the person already has in Studio', () => {
    const ctx = project();
    const live = liveBoardOf(ctx, 'Tareas');
    if (!live) throw new Error('no board');
    const theirs = { ...live.def, about: 'Lo que la persona ya estaba cambiando' };
    saveDraft(ctx, live.id, { definition: theirs, baseVersion: live.version }, now);
    const made = proposeBoardChange(
      ctx,
      { board: 'Tareas', need: 'x', lang: 'es', actor: kiln, channel: 'cli' },
      now,
    );
    expect(draftToStartFrom(ctx, made.item).about).toBe('Lo que la persona ya estaba cambiando');
  });

  it('refuses a board that is not published, a second change while one waits, and no reason', () => {
    const ctx = project();
    const ask = (board: string, need = 'x') =>
      proposeBoardChange(ctx, { board, need, lang: 'es', actor: kiln, channel: 'cli' }, now);
    expect(() => ask('Nada')).toThrow(expect.objectContaining({ code: 'not_found' }));
    expect(() => ask('Tareas', ' ')).toThrow(expect.objectContaining({ code: 'missing_fields' }));
    const first = ask('Tareas');
    expect(() => ask('Tareas')).toThrow(
      expect.objectContaining({ message: expect.stringContaining(first.item) }),
    );
  });
});
