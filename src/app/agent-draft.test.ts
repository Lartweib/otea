import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../core/board/model.ts';
import { step } from '../core/board/testing.ts';
import {
  draftToStartFrom,
  mergeAgentDraft,
  requestAgentDraft,
  submitAgentDraft,
  waitingDraftOf,
} from './agent-draft.ts';
import {
  ensureRequestsBoard,
  getBoardRecord,
  listBoardSummaries,
  publishBoard,
  publishPlan,
  restoreBoard,
  saveDraft,
} from './boards.ts';
import { BOARD_JSON_SCHEMA } from './draft-request.ts';
import { getItem, showItem } from './items.ts';
import { itemNextText } from './next.ts';
import type { Project } from './project.ts';
import { memoryContext, projectOf } from './testing.ts';

const kiln = { kind: 'agent' as const, name: 'kiln' };
const you = { kind: 'human' as const, name: 'human' };

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

    const pedido = getItem(ctx, item, now);
    expect(pedido.collection).toBe('Pedidos');
    expect(pedido.title).toBe('Esbozar el tablero Criaturas');
    // Qué necesitas keeps the person's words, and only them.
    expect(Object.values(pedido.fields)).toEqual(['Criaturas del pantano, con arte y animación']);
    expect(pedido.lease?.holder).toBe('kiln');
    expect(board.draft?.requestItem).toBe(item);
    const summary = listBoardSummaries(ctx).find(({ id }) => id === board.id);
    expect(summary).toMatchObject({ name: 'Criaturas', status: 'waiting', requestItem: item });
    expect(waitingDraftOf(ctx, item)?.id).toBe(board.id);
  });

  it('gives how to hand the draft in as the step instructions, and the page the board to open', () => {
    const ctx = project();
    const { board, item } = requestAgentDraft(
      ctx,
      { name: 'Criaturas', need: 'Criaturas del pantano', agent: 'kiln', lang: 'es' },
      now,
    );
    const pedido = getItem(ctx, item, now);

    const text = itemNextText(ctx, pedido, 'kiln') ?? '';
    const take = text.slice(text.indexOf('When you take it'), text.indexOf('Handoff'));
    expect(take).toContain(`otea board draft ${item} > board.json`);
    expect(take).toContain(`otea board draft ${item} --file board.json`);
    expect(take).toContain(`is the JSON Schema ${BOARD_JSON_SCHEMA}.`);
    expect(text).toContain('Qué necesitas: Criaturas del pantano');

    const shown = showItem(ctx, item, { actor: kiln, channel: 'cli' }, now).board?.request;
    expect(shown).toMatchObject({ board: board.id, name: 'Criaturas', arrived: false });
    expect(shown?.instructions).toContain(`otea board draft ${item} --file board.json`);
  });

  it('offers to close the Pedido on publish, and closes it as done when asked', () => {
    const ctx = project();
    const { board, item } = requestAgentDraft(
      ctx,
      { name: 'Criaturas', need: 'x', agent: 'kiln', lang: 'es' },
      now,
    );
    const draft = getBoardRecord(ctx, board.id).draft?.definition;
    if (!draft) throw new Error('no draft');
    submitAgentDraft(
      ctx,
      { id: item, text: JSON.stringify(agentFile(draft)), actor: kiln, channel: 'cli' },
      now,
    );
    expect(showItem(ctx, item, { actor: kiln, channel: 'cli' }, now).board?.request).toMatchObject({
      arrived: true,
    });

    expect(publishPlan(ctx, board.id).request).toEqual({
      id: item,
      title: 'Esbozar el tablero Criaturas',
    });
    publishBoard(ctx, board.id, { moves: {}, by: you, closeRequest: true }, now);

    const closed = getItem(ctx, item, now);
    expect(closed.state).toBe('done');
    expect(closed.lease).toBeNull();
    expect(closed.events.at(-2)).toMatchObject({
      type: 'transitioned',
      actor: you,
      data: { to: 'done', reason: 'Publicado el tablero Criaturas' },
    });
    expect(
      showItem(ctx, item, { actor: kiln, channel: 'cli' }, now).board?.request,
    ).toBeUndefined();
  });

  it('reopens the Pedido it closed when the publish is undone, its draft back on it', () => {
    const ctx = project();
    const { board, item } = requestAgentDraft(
      ctx,
      { name: 'Criaturas', need: 'x', agent: 'kiln', lang: 'es' },
      now,
    );
    const draft = getBoardRecord(ctx, board.id).draft?.definition;
    if (!draft) throw new Error('no draft');
    submitAgentDraft(
      ctx,
      { id: item, text: JSON.stringify(agentFile(draft)), actor: kiln, channel: 'cli' },
      now,
    );
    const before = getItem(ctx, item, now).state;
    publishBoard(ctx, board.id, { moves: {}, by: you, closeRequest: true }, now);

    restoreBoard(ctx, board.id, { version: null, by: you }, now);

    const reopened = getItem(ctx, item, now);
    expect(reopened.state).toBe(before);
    expect(reopened.events.at(-1)).toMatchObject({
      type: 'transitioned',
      actor: you,
      data: { from: 'done', to: before },
    });
    expect(getBoardRecord(ctx, board.id).draft).toMatchObject({ requestItem: item });
    expect(showItem(ctx, item, { actor: kiln, channel: 'cli' }, now).board?.request).toMatchObject({
      board: board.id,
      arrived: true,
    });
  });

  it('leaves the Pedido closed when a later publish, which did not close it, is undone', () => {
    const ctx = project();
    const { board, item } = requestAgentDraft(
      ctx,
      { name: 'Criaturas', need: 'x', agent: null, lang: 'es' },
      now,
    );
    const draft = getBoardRecord(ctx, board.id).draft?.definition;
    if (!draft) throw new Error('no draft');
    submitAgentDraft(
      ctx,
      { id: item, text: JSON.stringify(agentFile(draft)), actor: kiln, channel: 'cli' },
      now,
    );
    publishBoard(ctx, board.id, { moves: {}, by: you, closeRequest: true }, now);
    const live = getBoardRecord(ctx, board.id).live?.definition;
    if (!live) throw new Error('not published');
    saveDraft(ctx, board.id, { definition: { ...live, icon: 'star' }, baseVersion: 1 }, now);
    publishBoard(ctx, board.id, { moves: {}, by: you }, now);
    const events = getItem(ctx, item, now).events.length;

    restoreBoard(ctx, board.id, { version: 1, by: you }, now);

    expect(getItem(ctx, item, now).state).toBe('done');
    expect(getItem(ctx, item, now).events).toHaveLength(events);
  });

  it('leaves the Pedido open when the publish does not close it', () => {
    const ctx = project();
    const { board, item } = requestAgentDraft(
      ctx,
      { name: 'Criaturas', need: 'x', agent: null, lang: 'es' },
      now,
    );
    const draft = getBoardRecord(ctx, board.id).draft?.definition;
    if (!draft) throw new Error('no draft');
    submitAgentDraft(
      ctx,
      { id: item, text: JSON.stringify(agentFile(draft)), actor: kiln, channel: 'cli' },
      now,
    );

    publishBoard(ctx, board.id, { moves: {}, by: you }, now);

    expect(getItem(ctx, item, now).state).not.toBe('done');
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
    ).toThrowError(/The file is not a board:\n {2}.*steps/);
    expect(() =>
      submitAgentDraft(ctx, { id: item, text: 'not json', actor: kiln, channel: 'cli' }, now),
    ).toThrowError(/board\.json is not JSON/);
    expect(showItem(ctx, item, { actor: kiln, channel: 'cli' }).evidence).toEqual([]);
  });

  it('says what is wrong one line each, then where to start, the published shape and Studio', () => {
    const ctx = project();
    const { item } = requestAgentDraft(
      ctx,
      { name: 'Releases', need: 'x', agent: 'kiln', lang: 'en' },
      now,
    );
    const text = JSON.stringify({ name: 'Releases', steps: [], owner: 'kiln' });

    expect(() =>
      submitAgentDraft(ctx, { id: item, text, actor: kiln, channel: 'cli' }, now),
    ).toThrowError(
      [
        'The file is not a board:',
        '  the board lacks schema, item, icon, title, parts, form, anytime, layout, row, about, idle, cap and samples',
        '  the board: a key a board does not know: "owner" (it takes schema, name, item, icon, title, parts, form, steps, anytime, layout, row, about, idle, cap, samples, template, split, madeWith, drop, list)',
        `Start from what otea board draft ${item} prints: it has every key a board takes. Each key, with what it is for and an example, is in ${BOARD_JSON_SCHEMA}. A board you cannot get right in JSON, the person can finish in Studio.`,
      ].join('\n'),
    );
  });

  it('lists at most twelve problems, and says how many more there are', () => {
    const ctx = project();
    const { item } = requestAgentDraft(
      ctx,
      { name: 'Releases', need: 'x', agent: 'kiln', lang: 'en' },
      now,
    );
    // Fourteen steps, each whole but for an id that is not one.
    const steps = Array.from({ length: 14 }, (_, n) => ({ ...step(`s${n}`, 'x'), id: `S ${n}` }));
    const text = JSON.stringify({ ...draftToStartFrom(ctx, item), steps });

    let message = '';
    try {
      submitAgentDraft(ctx, { id: item, text, actor: kiln, channel: 'cli' }, now);
    } catch (error) {
      message = (error as Error).message;
    }
    const lines = message.split('\n');
    expect(lines.filter((line) => line.startsWith('  step '))).toHaveLength(12);
    expect(lines).toContain('  and 2 more');
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

  it('takes the agent board whole: its own steps replace the ones it left out, with its item and text', () => {
    const ctx = project();
    const { board, item } = requestAgentDraft(
      ctx,
      { name: 'Tomas', need: 'x', agent: 'kiln', lang: 'es' },
      now,
    );
    const draft = getBoardRecord(ctx, board.id).draft?.definition;
    if (!draft) throw new Error('no draft');
    const file: BoardDefinition = {
      ...draft,
      item: 'Toma',
      about: 'Cada toma se graba y se mezcla.',
      steps: [step('srec', 'Grabar'), step('smix', 'Mezclar')],
    };

    submitAgentDraft(
      ctx,
      { id: item, text: JSON.stringify(file), actor: kiln, channel: 'cli' },
      now,
    );
    const merged = getBoardRecord(ctx, board.id).draft;

    expect(merged?.definition.steps.map(({ name }) => name)).toEqual(['Grabar', 'Mezclar']);
    expect(merged?.definition.item).toBe('Toma');
    expect(merged?.definition.about).toBe('Cada toma se graba y se mezcla.');
    expect(merged?.definition.name).toBe('Tomas');
    expect(merged?.agentNote).toEqual([
      '+ paso Grabar',
      '+ paso Mezclar',
      `− paso ${draft.steps[0]?.name}`,
      'ítem: Toma',
      'cambios en Sobre este tablero',
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
