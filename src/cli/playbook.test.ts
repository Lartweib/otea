import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

const TASKS_PLAYBOOK = readFileSync(
  new URL('../../presets/tasks/playbook.md', import.meta.url),
  'utf8',
);

describe('playbook', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init');
  });

  afterEach(() => repo.remove());

  it('prints the preset playbook of a collection', async () => {
    await otea('collection', 'add', 'tasks');

    const { code, out } = await otea('playbook', '--collection', 'tasks');

    expect(code).toBe(0);
    expect(out).toBe(`${TASKS_PLAYBOOK.trimEnd()}\n`);
  });

  it('prints the collection, its preset and the playbook with --json', async () => {
    await otea('collection', 'add', 'work');

    expect(await json('playbook', '--collection', 'work')).toEqual({
      collection: 'work',
      preset: 'tasks',
      playbook: TASKS_PLAYBOOK,
    });
  });

  it('reads the playbook of a project preset from its directory', async () => {
    repo.write(
      '.otea/presets/notes/preset.yaml',
      [
        'preset: notes',
        'preset_version: 1',
        'playbook: ./how.md',
        'fields:',
        '  title: { module: text, required: create }',
        'workflow:',
        '  initial: open',
        '  states:',
        '    open: { turn: agent }',
        '    closed: { turn: none, closes: done }',
        '  transitions:',
        '    - { from: open, to: closed, by: human }',
        '',
      ].join('\n'),
    );
    repo.write('.otea/presets/notes/how.md', '# Notes\n\nWrite them down.\n');
    await otea('collection', 'add', 'notes', '--preset', 'notes');

    expect((await otea('playbook', '--collection', 'notes')).out).toBe(
      '# Notes\n\nWrite them down.\n',
    );
  });

  it('says so when the preset has no playbook', async () => {
    repo.write(
      '.otea/presets/bare/preset.yaml',
      [
        'preset: bare',
        'preset_version: 1',
        'fields:',
        '  title: { module: text, required: create }',
        'workflow:',
        '  initial: open',
        '  states:',
        '    open: { turn: agent }',
        '    closed: { turn: none, closes: done }',
        '  transitions:',
        '    - { from: open, to: closed, by: human }',
        '',
      ].join('\n'),
    );
    await otea('collection', 'add', 'bare', '--preset', 'bare');

    expect((await otea('playbook', '--collection', 'bare')).out).toBe(
      'The bare preset of collection "bare" has no playbook.\n',
    );
    expect((await json('playbook', '--collection', 'bare')).playbook).toBeNull();
  });

  it('indexes the collections without --collection, each with how to read its playbook', async () => {
    await otea('collection', 'add', 'tasks');
    await otea('collection', 'add', 'bugs', '--preset', 'bug-triage');

    const { code, out } = await otea('playbook');

    expect(code).toBe(0);
    expect(out).toBe(
      [
        'Each collection follows the playbook of its preset. Read the one you work in before acting:',
        '  tasks  tasks       otea playbook --collection tasks',
        '  bugs   bug-triage  otea playbook --collection bugs',
        '',
      ].join('\n'),
    );
    expect(await json('playbook')).toEqual({
      collections: [
        { name: 'tasks', preset: 'tasks', command: 'otea playbook --collection tasks' },
        { name: 'bugs', preset: 'bug-triage', command: 'otea playbook --collection bugs' },
      ],
    });
  });

  it('says how to start when the project has no collection', async () => {
    expect((await otea('playbook')).out).toBe(
      'No collections yet; a human adds one with "otea collection add <name>".\n',
    );
    expect(await json('playbook')).toEqual({ collections: [] });
  });

  it('fails with not_found for an unknown collection', async () => {
    const { code, err } = await otea('playbook', '--collection', 'nope', '--json');

    expect(code).toBe(3);
    expect(JSON.parse(err)).toEqual({
      error: { code: 'not_found', message: 'Collection "nope" not found' },
    });
  });
});
