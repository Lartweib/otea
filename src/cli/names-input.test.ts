import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBoardRecord, listBoardSummaries, publishBoard, saveDraft } from '../app/boards.ts';
import { openProject } from '../app/project.ts';
import { type Cli, cliAt, type TempRepo, tempGitRepo } from './testing.ts';

// A board keeps its steps and fields under hidden ids (s361vb0d, fjn944wp). A reader names them,
// and is answered by name: in list filters, in refusals, and in the history of a step since deleted.
describe('names in, names out', () => {
  let repo: TempRepo;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  const refusal = async (...argv: string[]) =>
    JSON.parse((await otea(...argv, '--json')).err).error;
  const ids = (out: string) => out.split('\n').filter(Boolean);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--template', 'bugs');
    await otea(
      'create',
      '--collection',
      'Bugs',
      '--title',
      'Crash',
      '--field',
      'Qué pasa=se cierra',
      '--field',
      'Gravedad=Alta',
    );
    await otea('create', '--collection', 'Bugs', '--title', 'Lag', '--field', 'Qué pasa=va lento');
  });

  afterEach(() => repo.remove());

  const listed = async (...filters: string[]) => {
    const { code, out, err } = await otea('list', ...filters);
    return { code, err, ids: ids(out).map((line) => line.split(/\s+/)[0]) };
  };

  describe('list filters', () => {
    it('keeps the items at a step named as the board names it, in any case', async () => {
      await otea('claim', 'BUG-2');
      await otea('update', 'BUG-2', '--field', 'Causa probable=red', '--field', 'Gravedad=Baja');
      expect((await otea('handoff', 'BUG-2')).code).toBe(0);
      expect((await listed('--state', 'refinar')).ids).toEqual(['BUG-1']);
      expect((await listed('--state', 'Refinar (in review)')).ids).toEqual(['BUG-2']);
      expect((await listed('--collection', 'Bugs', '--state', 'REFINAR')).ids).toEqual(['BUG-1']);
    });

    it('still takes the stored state id', async () => {
      const { state } = await json('show', 'BUG-1');
      expect((await listed('--state', state)).ids).toEqual(['BUG-1', 'BUG-2']);
    });

    it('keeps the items whose field holds a value named as the board names it', async () => {
      expect((await listed('--field', 'gravedad=alta')).ids).toEqual(['BUG-1']);
      expect((await listed('--field', 'Qué pasa=va lento')).ids).toEqual(['BUG-2']);
      const { fields } = await json('show', 'BUG-1');
      const severity = fields.find(({ name }: { name: string }) => name === 'Gravedad');
      expect((await listed('--field', `${severity.id}=high`)).ids).toEqual(['BUG-1']);
    });

    it('refuses a step the board has not, naming the steps it has', async () => {
      const { code, err } = await listed('--collection', 'Bugs', '--state', 'Nada');
      expect(code).not.toBe(0);
      expect(err).toContain(
        'Bugs has no step "Nada"; its steps are Refinar, Refinar (in review), Arreglar, Arreglar (in review), Done, Dropped',
      );
      expect((await listed('--state', 'Nada')).err).toMatch(
        /No board has a step "Nada"; .*Refinar/,
      );
    });

    it('refuses a field the board has not, naming the fields it has', async () => {
      const { code, err } = await listed('--collection', 'Bugs', '--field', 'Color=rojo');
      expect(code).not.toBe(0);
      expect(err).toContain('Bugs has no field "Color"; its fields are');
      expect(err).toContain('Gravedad');
    });
  });

  describe('refusals', () => {
    it('names a missing required field, its id kept in the --json details', async () => {
      const { err } = await otea('create', '--collection', 'Bugs', '--title', 'x');
      expect(err).toContain('missing required field "Qué pasa"');
      expect(err).not.toMatch(/"[a-z0-9]{8}"/);
      const error = await refusal('create', '--collection', 'Bugs', '--title', 'x');
      const { fields } = await json('show', 'BUG-1');
      const what = fields.find(({ name }: { name: string }) => name === 'Qué pasa');
      expect(error.details).toEqual({ kind: 'invalid_fields', fields: [what.id] });
    });

    it('names the evidence a file does not fit', async () => {
      writeFileSync(join(repo.dir, 'notes.txt'), 'x');
      const { err } = await otea('attach', 'BUG-1', 'notes.txt');
      expect(err).toContain(
        'It takes: "Cambios de código" (diff): diff; "Vídeo del arreglo" (recording, frames): video',
      );
    });

    it('names the steps of a move the board has not, their ids kept in the --json details', async () => {
      const { err } = await otea('relay', 'BUG-1', 'Hecho', '--quote', 'ok');
      expect(err).toContain('Cannot move from "Refinar" to "Done"');
      const error = await refusal('relay', 'BUG-1', 'Hecho', '--quote', 'ok');
      const { state } = await json('show', 'BUG-1');
      expect(error.details).toEqual({ kind: 'move', why: 'no_move', from: state, to: 'done' });
    });
  });

  it('keeps in the history the name of a step since deleted', async () => {
    const { state } = await json('show', 'BUG-1');
    const project = openProject(repo.dir);
    try {
      const board = listBoardSummaries(project).find(({ collection }) => collection === 'Bugs');
      const live = board && getBoardRecord(project, board.id).live;
      if (!board || !live) throw new Error('no Bugs board');
      const def = structuredClone(live.definition);
      const [first, second] = def.steps;
      if (!first || !second) throw new Error('Bugs has two steps');
      def.steps = [{ ...second, back: 'same' }];
      saveDraft(project, board.id, { definition: def, baseVersion: live.version });
      const by = { kind: 'human' as const, name: 'ana' };
      publishBoard(project, board.id, { moves: { [first.id]: second.id }, by });
    } finally {
      project.db.close();
    }

    const { out } = await otea('events', '--item', 'BUG-1');
    expect(out).toMatch(/ created {2}Refinar\n/);
    expect(out).toMatch(/ transitioned {2}Refinar -> Arreglar \(publish\)\n/);
    expect(out).not.toContain(state);
    const { events } = await json('show', 'BUG-1');
    expect(events[0].data).toMatchObject({ state, stateName: 'Refinar' });
    expect(events.at(-1).data).toMatchObject({ from: state, fromName: 'Refinar' });
  });
});
