import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { getItem } from '../app/items.ts';
import { openProject } from '../app/project.ts';
import { handoffCheck, positionOf } from '../core/board/engine.ts';
import { nextText, refusalText } from '../core/board/next.ts';
import { creatures } from '../core/board/testing.ts';
import { type Cli, cliAt, type TempRepo, tempGitRepo } from './testing.ts';

// Agents on a published board: next, handoff, approve and send-back, worded by the one writer.
describe('next and the board moves', () => {
  let repo: TempRepo;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init');
    const project = openProject(repo.dir);
    try {
      const record = createBoard(project, { name: 'Criaturas', lang: 'es' });
      saveDraft(project, record.id, { definition: creatures(), baseVersion: null });
      publishBoard(project, record.id, { moves: {}, by: { kind: 'human', name: 'fede' } });
    } finally {
      project.db.close();
    }
    await otea(
      'create',
      '--collection',
      'Criaturas',
      '--title',
      'Tortuga',
      '--field',
      'fdesc=Lenta',
    );
  });

  afterEach(() => repo.remove());

  const art = () => {
    const path = join(repo.dir, 'art.png');
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return path;
  };

  it('prints the item to take in exactly the words nextText writes', async () => {
    const { code, out } = await otea('next', '--as', 'quill');

    const project = openProject(repo.dir);
    let expected: string;
    try {
      const item = getItem(project, 'CRI-1');
      const position = positionOf(item.state);
      expected = nextText(creatures(), {
        id: 'CRI-1',
        title: 'Tortuga',
        position,
        round: 1,
        fields: item.fields,
        evidence: {},
        missing: handoffCheck(creatures(), 'sconcept', { fields: item.fields, evidence: [] })
          .missing,
        me: 'quill',
      });
    } finally {
      project.db.close();
    }
    expect(code).toBe(0);
    expect(out).toBe(`${expected}\n`);
  });

  it('says what to do meanwhile when nothing is the agent’s', async () => {
    await otea('attach', 'CRI-1', art(), '--module', 'eart', '--as', 'quill');
    await otea('handoff', 'CRI-1', '--as', 'quill');

    const { code, out } = await otea('next', '--collection', 'Criaturas', '--as', 'kiln');

    expect(code).toBe(0);
    expect(out).toBe('Nothing to do on Criaturas right now.\n');
    expect((await otea('next', '--collection', 'Nope')).code).toBe(3);
  });

  it('refuses a handoff with nothing attached, exactly, then hands it off', async () => {
    const early = await otea('handoff', 'CRI-1', '--as', 'quill');

    expect(early.code).toBe(8);
    expect(early.err).toBe(
      `otea: ${refusalText('CRI-1', [{ ref: 'eart', name: 'Arte conceptual', reason: 'missing', fresh: true }])}\n`,
    );
    expect(early.err).toContain('Not handed off CRI-1: missing Arte conceptual (new this round).');
    await otea('attach', 'CRI-1', art(), '--module', 'eart', '--as', 'quill');

    const handed = await otea('handoff', 'CRI-1', '--as', 'quill');

    expect(handed).toMatchObject({
      code: 0,
      out: 'Handed off. CRI-1 waits for the person to review Concepto.\n',
    });
    expect((await json('show', 'CRI-1')).state).toBe('sconcept__review');
  });

  it('refuses an agent approving the person’s review as forbidden, and a bad way', async () => {
    await otea('attach', 'CRI-1', art(), '--module', 'eart', '--as', 'quill');
    await otea('handoff', 'CRI-1', '--as', 'quill');

    expect((await otea('approve', 'CRI-1', '--as', 'quill')).code).toBe(7);
    expect((await otea('send-back', 'CRI-1', '--reason', 'No', '--as', 'quill')).code).toBe(7);
    expect((await otea('send-back', 'CRI-1')).code).toBe(2);
    const bad = await otea('handoff', 'CRI-1', '--way', 'Nowhere', '--as', 'quill');
    expect(bad.code).toBe(4);
  });

  it('prints the moved item and the line with --json', async () => {
    await otea('attach', 'CRI-1', art(), '--module', 'eart', '--as', 'quill');

    const handed = await json('handoff', 'CRI-1', '--as', 'quill');

    expect(handed).toMatchObject({
      item: { id: 'CRI-1', state: 'sconcept__review', turn: 'human' },
      text: 'Handed off. CRI-1 waits for the person to review Concepto.',
    });
  });
});
