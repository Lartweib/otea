import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../core/board/model.ts';
import { step } from '../core/board/testing.ts';
import {
  mergeAgentDraft,
  requestAgentDraft,
  submitAgentDraft,
  waitingDraftOf,
} from './agent-draft.ts';
import { ensureRequestsBoard, getBoardRecord, listBoardSummaries } from './boards.ts';
import { getItem, showItem } from './items.ts';
import type { Project } from './project.ts';
import { memoryContext, projectOf } from './testing.ts';

const kiln = { kind: 'agent' as const, name: 'kiln' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();

describe('an agent drafting a board', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function project(): Project {
    const root = mkdtempSync(join(tmpdir(), 'otea-agent-draft-'));
    dirs.push(root);
    const ctx = projectOf(root, memoryContext());
    ensureRequestsBoard(ctx, 'es', now);
    return ctx;
  }

  // What the agent hands in: the draft it started from, with a step and a piece of evidence more,
  // and instructions on the step that was there.
  function agentFile(draft: BoardDefinition): BoardDefinition {
    const [first] = draft.steps;
    if (!first) throw new Error('no step');
    return {
      ...draft,
      parts: {
        ...draft.parts,
        eart: { id: 'eart', name: 'Arte conceptual', kind: 'images', hint: '', options: [] },
      },
      steps: [
        step('sconcept', 'Concepto', { hand: [{ ref: 'eart', req: 'always', fresh: true }] }),
        { ...first, instructions: { ...first.instructions, take: 'Anima desde el @[eart].' } },
      ],
    };
  }

  it('asks for it on a Pedido and leaves the board waiting', () => {
    const ctx = project();

    const { board, item } = requestAgentDraft(
      ctx,
      {
        name: 'Criaturas',
        need: 'Criaturas del pantano, con arte y animación',
        agent: 'kiln',
        lang: 'es',
      },
      now,
    );

    const pedido = getItem(ctx, item);
    expect(pedido.collection).toBe('Pedidos');
    expect(pedido.title).toBe('Esbozar el tablero Criaturas');
    expect(Object.values(pedido.fields)[0]).toContain(
      'Criaturas del pantano, con arte y animación',
    );
    expect(Object.values(pedido.fields)[0]).toContain(`otea board draft ${item}`);
    expect(pedido.lease?.holder).toBe('kiln');
    expect(board.draft?.requestItem).toBe(item);
    const summary = listBoardSummaries(ctx).find(({ id }) => id === board.id);
    expect(summary).toMatchObject({ name: 'Criaturas', status: 'waiting', requestItem: item });
    expect(waitingDraftOf(ctx, item)?.id).toBe(board.id);
  });

  it('words the Pedido in English when asked to', () => {
    const ctx = project();

    const { item } = requestAgentDraft(
      ctx,
      { name: 'Creatures', need: 'x', agent: null, lang: 'en' },
      now,
    );

    expect(getItem(ctx, item).title).toBe('Draft the board Creatures');
    expect(getItem(ctx, item).lease).toBeNull();
  });

  it('refuses a draft that is not a board, in words, attaching nothing', () => {
    const ctx = project();
    const { item } = requestAgentDraft(
      ctx,
      { name: 'Criaturas', need: 'x', agent: 'kiln', lang: 'es' },
      now,
    );

    expect(() =>
      submitAgentDraft(ctx, { id: item, text: '{"name": 3}', actor: kiln, channel: 'cli' }, now),
    ).toThrowError(/The file is not a board: .*steps/);
    expect(() =>
      submitAgentDraft(ctx, { id: item, text: 'not json', actor: kiln, channel: 'cli' }, now),
    ).toThrowError(/board\.json is not JSON/);
    expect(showItem(ctx, item, { actor: kiln, channel: 'cli' }).evidence).toEqual([]);
  });

  it('attaches the draft to the Pedido and merges it into the board at once, leaving the waiting status with a note', () => {
    const ctx = project();
    const { board, item } = requestAgentDraft(
      ctx,
      { name: 'Criaturas', need: 'x', agent: 'kiln', lang: 'es' },
      now,
    );
    const draft = getBoardRecord(ctx, board.id).draft?.definition;
    if (!draft) throw new Error('no draft');

    const submitted = submitAgentDraft(
      ctx,
      { id: item, text: JSON.stringify(agentFile(draft)), actor: kiln, channel: 'cli' },
      now,
    );

    expect(submitted.evidence).toMatchObject({ module: 'files', filename: 'board.json' });
    expect(submitted.problems).toEqual([]);
    // Handing it in is the agent's handoff of the draft: Studio's home sees it arrive.
    const merged = getBoardRecord(ctx, board.id);

    expect(merged.draft?.agentNote).toEqual([
      '+ paso Concepto',
      '+ evidencia Arte conceptual',
      `instrucciones en ${draft.steps[0]?.name}`,
    ]);
    expect(merged.draft?.definition.steps.map(({ id }) => id)).toEqual([
      'sconcept',
      draft.steps[0]?.id,
    ]);
    expect(listBoardSummaries(ctx).find(({ id }) => id === board.id)?.status).toBe('draft');
    // Merging the same file again by id changes nothing the agent added.
    const again = mergeAgentDraft(ctx, board.id, submitted.evidence.id, now);
    expect(again.draft?.definition.steps.map(({ id }) => id)).toEqual([
      'sconcept',
      draft.steps[0]?.id,
    ]);
  });

  it('refuses to merge evidence that is not a board draft of the board', () => {
    const ctx = project();
    const { board } = requestAgentDraft(
      ctx,
      { name: 'Criaturas', need: 'x', agent: null, lang: 'es' },
      now,
    );

    expect(() => mergeAgentDraft(ctx, board.id, 99, now)).toThrowError(
      expect.objectContaining({ code: 'not_found' }),
    );
  });
});
