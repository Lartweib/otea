import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../store/database.ts';
import { insertRelation } from '../store/queries.ts';
import { type Cli, cliAt, presetCollection, type TempRepo, tempGitRepo } from './testing.ts';

const NOTES = (version: number) => `
preset: notes
preset_version: ${version}
fields:
  title: { module: text, required: create }
workflow:
  initial: open
  states: { open: { turn: agent }, closed: { turn: none, closes: discarded } }
  transitions: [{ from: open, to: closed, by: agent }]
`;

describe('validate', () => {
  let repo: TempRepo;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local');
    presetCollection(repo.dir, 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'A', '--description', 'D');
  });

  afterEach(() => repo.remove());

  it('exits 0 on a clean project', async () => {
    expect(await otea('validate')).toEqual({ code: 0, out: 'No problems found.\n', err: '' });
  });

  it('warns on a preset that uses close_requires, suggesting requires', async () => {
    const deprecated = NOTES(1).replace(
      'closes: discarded }',
      'closes: discarded, close_requires: children_closed }',
    );
    repo.write('.otea/presets/notes/preset.yaml', deprecated);

    const { code, out } = await otea('validate');

    expect(code).toBe(0);
    expect(out).toContain(
      'warning  preset notes  workflow.states.closed.close_requires: deprecated; write requires: children_closed',
    );
    expect(out).toContain('0 errors, 1 warning');
  });

  it('warns on a parent in another collection, linked before the rule, and keeps it', async () => {
    presetCollection(repo.dir, 'bugs');
    await otea('create', '--collection', 'bugs', '--title', 'Clips', '--description', 'D');
    const db = openDatabase(join(repo.dir, '.otea', 'otea.db'));
    const actor = { kind: 'human', name: 'ana' } as const;
    insertRelation(db, {
      kind: 'parent',
      from: 'BUGS-1',
      to: 'TASKS-1',
      createdAt: 't0',
      actor,
      channel: 'cli',
    });
    db.close();

    const { code, out } = await otea('validate');

    expect(code).toBe(0);
    expect(out).toContain(
      'warning  BUGS-1  parent TASKS-1 is in another collection (tasks); merge bugs and tasks into one preset as types, or convert the link to implements: otea unlink BUGS-1 parent TASKS-1, otea link BUGS-1 implements TASKS-1',
    );
    expect((await otea('show', 'BUGS-1')).out).toMatch(/parent\s+TASKS-1/);
  });

  it('reports a broken project preset and exits with validation_failed', async () => {
    const broken = NOTES(1).replace('notes', 'broken').replace('initial: open', 'initial: x');
    repo.write('.otea/presets/broken/preset.yaml', broken);

    const { code, out } = await otea('validate');

    expect(code).toBe(10);
    expect(out).toContain('error  preset broken  workflow.initial: unknown state "x"');
    expect(out).toContain('1 error, 0 warnings');
  });

  it('reports an unknown type icon with the close matches', async () => {
    repo.write('.otea/presets/notes/preset.yaml', `${NOTES(1)}icon: noet\n`);

    const { code, out } = await otea('validate');

    expect(code).toBe(10);
    expect(out).toContain('error  preset notes  icon: unknown icon "noet" (did you mean note?)');
  });

  it('prints the report with --json', async () => {
    repo.write('.otea/presets/tasks/preset.yaml', NOTES(1));

    const { code, out } = await otea('validate', '--json');

    expect(code).toBe(10);
    expect(JSON.parse(out)).toEqual({
      errors: 1,
      warnings: 0,
      findings: [
        {
          severity: 'error',
          subject: 'preset tasks',
          message: '"tasks" is an official preset name; rename the project preset',
        },
      ],
    });
  });

  it('is listed in the help', async () => {
    expect((await otea('help')).out).toContain('otea validate');
  });
});
