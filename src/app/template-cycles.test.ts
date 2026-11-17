import { describe, expect, it } from 'vitest';
import { isClosed, positionOf } from '../core/board/engine.ts';
import type { BoardDefinition, Part, Step } from '../core/board/model.ts';
import type { EvidenceKind } from '../core/evidence.ts';
import type { Actor } from '../core/item.ts';
import { insertEvidence } from '../store/queries.ts';
import type { Context } from './context.ts';
import { initBoards } from './init-boards.ts';
import { createItem, requireItem, updateItem } from './items.ts';
import { claimItem } from './leases.ts';
import { approveItem, handoffItem, liveBoardOf } from './next.ts';
import { memoryContext } from './testing.ts';

// A fresh project made from each official template takes an item from its first step to Hecho:
// agents do the agents' steps with everything the step asks for, another agent or the person
// reviews, and the person does the person's steps.

const you: Actor = { kind: 'human', name: 'fede' };
const doer: Actor = { kind: 'agent', name: 'quill' };
const reviewer: Actor = { kind: 'agent', name: 'brush' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 16, 9, 0, tick++)).toISOString();

const EVIDENCE: Record<string, EvidenceKind> = {
  images: 'image',
  video: 'video',
  audio: 'audio',
  code: 'diff',
  log: 'log',
  diagram: 'diagram',
  file: 'file',
};

function valueFor(part: Part): string {
  switch (part.kind) {
    case 'choice':
      return part.initial ?? part.options[0]?.id ?? '';
    case 'level':
      return part.initial ?? 'medium';
    case 'yesno':
      return 'yes';
    case 'url':
      return 'https://github.com/o/r/pull/7';
    case 'number':
      return '1';
    case 'branch':
      return 'feat/x';
    default:
      return 'Written by the agent';
  }
}

function boardOf(ctx: Context, name: string): BoardDefinition {
  const board = liveBoardOf(ctx, name);
  if (!board) throw new Error(`no live board ${name}`);
  return board.def;
}

// Everything the step hands off, filled: fields by value, evidence as one file each.
function fill(ctx: Context, id: string, def: BoardDefinition, step: Step, actor: Actor) {
  const fields: Record<string, string> = {};
  for (const { ref } of step.hand) {
    const part = def.parts[ref];
    if (!part) continue;
    const kind = EVIDENCE[part.kind];
    if (kind === undefined) {
      fields[ref] = valueFor(part);
      continue;
    }
    insertEvidence(ctx.db, {
      itemId: id,
      role: part.show === 'ba' ? 'after' : 'single',
      module: ref,
      kind,
      filename: `${ref}.bin`,
      contentType: 'application/octet-stream',
      size: 1,
      sha256: 'a'.repeat(64),
      caption: null,
      createdAt: now(),
      actor,
      channel: 'cli',
    });
  }
  if (Object.keys(fields).length > 0) updateItem(ctx, { id, fields, actor }, now);
}

// Moves the item along until it is closed, and returns the steps it went through.
function runToDone(ctx: Context, id: string, def: BoardDefinition): string[] {
  const walked: string[] = [];
  for (let turn = 0; turn < 20; turn++) {
    const position = positionOf(requireItem(ctx.db, id).state);
    if (isClosed(position)) return walked;
    const step = def.steps.find(({ id: stepId }) => stepId === position.step);
    if (!step) throw new Error(`no step ${position.step}`);
    if (position.phase === 'doing') {
      walked.push(step.name);
      const actor = step.doer === 'you' ? you : doer;
      if (actor.kind === 'agent') claimItem(ctx, { id, actor }, now);
      fill(ctx, id, def, step, actor);
      handoffItem(ctx, { id, actor, channel: 'cli', note: 'What I did and how I checked it' }, now);
    } else {
      const actor = step.reviewer === 'you' ? you : reviewer;
      approveItem(ctx, { id, actor, channel: actor.kind === 'human' ? 'ui' : 'cli' }, now);
    }
  }
  throw new Error(`${id} never reached Done`);
}

// A new item with the fields its form requires, or every field of the form with `all`.
function newItem(
  ctx: Context,
  def: BoardDefinition,
  opts: { parent?: string; all?: boolean } = {},
) {
  const { parent, all = false } = opts;
  const fields: Record<string, string> = {};
  for (const { ref, required } of def.form) {
    const part = def.parts[ref];
    if (!required && !all) continue;
    if (part && EVIDENCE[part.kind] === undefined) fields[ref] = valueFor(part);
  }
  return createItem(
    ctx,
    {
      collection: def.name,
      title: `A ${def.item}`,
      fields,
      actor: you,
      ...(parent ? { parent } : {}),
    },
    now,
  ).id;
}

describe('a project made from an official template', () => {
  it('takes an Idea through Refinar, Diseñar and Planificar, and its Tarea to Hecho', () => {
    const ctx = memoryContext();
    expect(initBoards(ctx, 'ideas').map(({ name }) => name)).toEqual(['Ideas', 'Implementación']);
    const ideas = boardOf(ctx, 'Ideas');
    const tasks = boardOf(ctx, 'Implementación');

    const idea = newItem(ctx, ideas);
    expect(runToDone(ctx, idea, ideas)).toEqual(['Refinar', 'Diseñar', 'Planificar']);
    expect(requireItem(ctx.db, idea).state).toBe('done');

    const task = newItem(ctx, tasks);
    expect(runToDone(ctx, task, tasks)).toEqual(['Preparar', 'Hacer']);
    expect(requireItem(ctx.db, task).state).toBe('done');
    // A task born complete, as Planificar makes them, skips Preparar.
    const planned = newItem(ctx, tasks, { all: true });
    expect(runToDone(ctx, planned, tasks)).toEqual(['Hacer']);
  });

  it('takes a Trabajo through Analizar and Entregar once its Entrega is merged in', () => {
    const ctx = memoryContext();
    expect(initBoards(ctx, 'repos').map(({ name }) => name)).toEqual(['Trabajos', 'Entregas']);
    const jobs = boardOf(ctx, 'Trabajos');
    const deliveries = boardOf(ctx, 'Entregas');

    const job = newItem(ctx, jobs);
    const delivery = newItem(ctx, deliveries, { parent: job });
    expect(runToDone(ctx, delivery, deliveries)).toEqual(['Implementar', 'Aprobar el merge']);
    expect(runToDone(ctx, job, jobs)).toEqual(['Analizar', 'Entregar']);
    expect(requireItem(ctx.db, job).state).toBe('done');
  });

  it('takes a Cambio through Aclarar, Hacerlo and Integrar, with one approval', () => {
    const ctx = memoryContext();
    expect(initBoards(ctx, 'changes').map(({ name }) => name)).toEqual(['Cambios']);
    const changes = boardOf(ctx, 'Cambios');

    const change = newItem(ctx, changes);
    expect(runToDone(ctx, change, changes)).toEqual(['Aclarar', 'Hacerlo', 'Integrar']);
    expect(requireItem(ctx.db, change).state).toBe('done');
    // Born with what Aclarar writes, it starts in Hacerlo.
    const clear = newItem(ctx, changes, { all: true });
    expect(runToDone(ctx, clear, changes)).toEqual(['Hacerlo', 'Integrar']);
  });

  const CATALOGUE: readonly (readonly [key: string, board: string, walk: readonly string[]])[] = [
    ['bug-reports', 'Errores', ['Completar', 'Triar', 'Arreglar', 'Integrar']],
    ['research', 'Investigación', ['Investigar', 'Responder']],
    ['decisions', 'Decisiones', ['Investigar', 'Decidir', 'Registrar']],
    ['content', 'Contenido', ['Esquema', 'Redactar', 'Poner en línea']],
    ['design', 'Diseño visual', ['Crear', 'Integrar']],
    ['experiments', 'Experimentos', ['Planificar', 'Correr']],
  ];
  for (const [key, name, walk] of CATALOGUE) {
    it(`takes an item of the ${key} template through ${walk.join(', ')} to Hecho`, () => {
      const ctx = memoryContext();
      expect(initBoards(ctx, key).map(({ name: made }) => made)).toEqual([name]);
      const board = boardOf(ctx, name);
      const item = newItem(ctx, board);
      expect(runToDone(ctx, item, board)).toEqual(walk);
      expect(requireItem(ctx.db, item).state).toBe('done');
    });
  }
});
