import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, type TempRepo, tempGitRepo } from './testing.ts';

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
    otea = cliAt(repo.dir);
    await otea('init');
    await otea('collection', 'add', 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'A', '--description', 'D');
  });

  afterEach(() => repo.remove());

  it('exits 0 on a clean project', async () => {
    expect(await otea('validate')).toEqual({ code: 0, out: 'No problems found.\n', err: '' });
  });

  it('exits 0 with warnings only', async () => {
    repo.write('.otea/presets/notes/preset.yaml', NOTES(1));
    await otea('collection', 'add', 'notes', '--preset', 'notes');
    await otea('create', '--collection', 'notes', '--title', 'N');
    repo.write('.otea/presets/notes/preset.yaml', NOTES(2));

    const { code, out } = await otea('validate');

    expect(code).toBe(0);
    expect(out).toContain('warning  NOTES-1  written under preset notes v1; the preset is now v2');
    expect(out).toContain('0 errors, 1 warning');
  });

  it('reports a broken project preset and exits with validation_failed', async () => {
    const broken = NOTES(1).replace('notes', 'broken').replace('initial: open', 'initial: x');
    repo.write('.otea/presets/broken/preset.yaml', broken);

    const { code, out } = await otea('validate');

    expect(code).toBe(10);
    expect(out).toContain('error  preset broken  workflow.initial: unknown state "x"');
    expect(out).toContain('1 error, 0 warnings');
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
