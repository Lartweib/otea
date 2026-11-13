import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { cambios, errores, tareasDeRepo } from '../core/board/testing.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// The moves an agent makes on a board from the CLI: a way back, the note of a handoff, a drop.
describe('board moves from the CLI', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  let mender: Cli;
  let id: string;

  const errorOf = async (cli: Cli, ...argv: string[]) => {
    const result = await cli(...argv, '--json');
    return {
      code: result.code,
      error: JSON.parse(result.err).error as { code: string; message: string },
    };
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    mender = cliAt(repo.dir, { OTEA_AGENT: 'mender' });
    await otea('init', '--local', '--template', 'none');
    const project = openProject(repo.dir);
    try {
      publishAs(project, errores(), 'berr');
    } finally {
      project.db.close();
    }
    const created = JSON.parse(
      (
        await otea(
          'create',
          '--collection',
          'Errores',
          '--title',
          'Faro',
          '--field',
          'Pasos=abrir',
          '--json',
        )
      ).out,
    );
    id = created.id;
  });

  afterEach(() => repo.remove());

  // Walks the bug to Arreglar: Completar is skipped (it came with its Pasos), the person triages.
  async function toFix() {
    const project = openProject(repo.dir);
    try {
      const { handoffItem } = await import('../app/next.ts');
      const { getItem, updateItem } = await import('../app/items.ts');
      const you = { kind: 'human' as const, name: 'fede' };
      updateItem(project, { id, fields: { fcat: 'cgame' }, actor: you });
      if (getItem(project, id).state === 'sfill')
        handoffItem(project, { id, actor: you, channel: 'ui' });
      handoffItem(project, { id, actor: you, channel: 'ui' });
      expect(getItem(project, id).state).toBe('sfix');
    } finally {
      project.db.close();
    }
  }

  it('takes an item back only with a reason, then says its new round', async () => {
    await toFix();

    expect(await errorOf(mender, 'handoff', id, '--way', 'Triar')).toEqual({
      code: 2,
      error: { code: 'reason_required', message: 'Not taken back: say why with --reason.' },
    });
    const back = await mender('handoff', id, '--way', 'Triar', '--reason', 'no es un bug');
    expect(back.code).toBe(0);
    expect(back.out.trim()).toBe(`Taken back. ${id} returns to Triar, round 2.`);
  });

  it('asks for the note with exit 8, then keeps it', async () => {
    await toFix();
    repo.write('fix.diff', 'diff');
    await mender('attach', id, 'fix.diff', '--module', 'Cambios de código');

    expect(await errorOf(mender, 'handoff', id)).toEqual({
      code: 8,
      error: {
        code: 'missing_fields',
        message: `Not handed off ${id}: missing a note.\nCall handoff again with --note "la prueba".`,
      },
    });
    const done = await mender('handoff', id, '--note', 'se enciende');
    expect(done.out.trim()).toBe(`Handed off. ${id} waits for the person to review Arreglar.`);
    const shown = JSON.parse((await otea('show', id, '--json')).out);
    expect(shown.board.notes[0]).toMatchObject({ step: 'Arreglar', round: 1, note: 'se enciende' });
  });

  it('drops with a motive named by --motive, refusing without one', async () => {
    await toFix();

    expect(await errorOf(mender, 'drop', id, '--reason', 'ya está')).toEqual({
      code: 2,
      error: {
        code: 'reason_required',
        message: `Not dropped ${id}: say which with --motive "Rechazado|Duplicado".`,
      },
    });
    const dropped = await mender('drop', id, '--reason', 'ya está', '--motive', 'Duplicado');
    expect(dropped.out.trim()).toBe(`Dropped. ${id} is Dropped (Duplicado).`);
    expect((await otea('next', '--as', 'mender')).out).not.toContain(id);
  });

  it('refuses an agent’s drop where only the person drops, with exit 7', async () => {
    expect(await errorOf(mender, 'drop', id, '--reason', 'x', '--motive', 'Rechazado')).toEqual({
      code: 7,
      error: { code: 'forbidden', message: `Not dropped ${id}: only the person drops items here.` },
    });
  });
});

describe('a relayed drop', () => {
  it('is refused where the person drops only from the page, with exit 4', async () => {
    const repo = tempGitRepo();
    try {
      const otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
      await otea('init', '--local', '--template', 'none');
      const project = openProject(repo.dir);
      try {
        publishAs(project, errores(), 'berr');
      } finally {
        project.db.close();
      }
      const id = JSON.parse(
        (await otea('create', '--collection', 'Errores', '--title', 'Faro', '--json')).out,
      ).id;
      const result = await otea(
        'relay',
        id,
        'dropped__duplicate',
        '--quote',
        'tíralo',
        '--reason',
        'repetido',
        '--json',
      );
      expect(result.code).toBe(4);
      expect(JSON.parse(result.err).error).toEqual({
        code: 'not_relayable',
        message: "Not relayed: on Errores the person drops items from the item's page.",
      });
    } finally {
      repo.remove();
    }
  });
});

describe('otea create on a board', () => {
  it('says where the item starts, and refuses a part without its parent (exit 16)', async () => {
    const repo = tempGitRepo();
    try {
      const otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
      await otea('init', '--local', '--template', 'none');
      const project = openProject(repo.dir);
      try {
        publishAs(project, errores(), 'berr');
        publishAs(project, tareasDeRepo(), 'brt');
        publishAs(project, cambios(), 'bcam');
      } finally {
        project.db.close();
      }
      const ready = await otea(
        'create',
        '--collection',
        'Errores',
        '--title',
        'F',
        '--field',
        'Pasos=a',
      );
      expect(ready.out.trim()).toMatch(
        /^Created \S+ in Triar: it already had everything Completar asks for\.$/,
      );
      const alone = await otea(
        'create',
        '--collection',
        'Tareas de repo',
        '--title',
        'API',
        '--json',
      );
      expect(alone.code).toBe(16);
      expect(JSON.parse(alone.err).error.code).toBe('parent_required');
    } finally {
      repo.remove();
    }
  });
});
