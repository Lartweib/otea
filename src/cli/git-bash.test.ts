import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, presetCollection, tempGitRepo } from './testing.ts';

// Git Bash on Windows (MSYSTEM set) turns an argument that starts with / into a path under its own
// folder before Otea sees it: /deploy arrives as C:/Program Files/Git/deploy.
const GIT_BASH = { MSYSTEM: 'MINGW64', EXEPATH: 'C:\\Program Files\\Git\\bin' };
const ROOT = 'C:/Program Files/Git';

describe('Git Bash', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude', ...GIT_BASH });
    await otea('init', '--local');
    presetCollection(repo.dir, 'Tareas');
  });

  afterEach(() => repo.remove());

  it('gives back the slash it turned into a path, in a title and a field', async () => {
    const item = await json(
      'create',
      '--collection',
      'Tareas',
      '--title',
      `${ROOT}/deploy fails`,
      '--description',
      `${ROOT}/start answers twice`,
    );

    expect(item.title).toBe('/deploy fails');
    expect(item.fields).toContainEqual(expect.objectContaining({ value: '/start answers twice' }));
  });

  it('gives it back in a key=value field', async () => {
    const item = await json(
      'create',
      '--collection',
      'Tareas',
      '--title',
      'Commands',
      '--field',
      `description=${ROOT}/help is empty`,
    );

    expect(item.fields).toContainEqual(expect.objectContaining({ value: '/help is empty' }));
  });

  it('leaves the text alone outside Git Bash', async () => {
    const plain = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    const item = JSON.parse(
      (await plain('create', '--collection', 'Tareas', '--title', `${ROOT}/deploy fails`, '--json'))
        .out,
    );

    expect(item.title).toBe(`${ROOT}/deploy fails`);
  });

  it('leaves a path a command reads alone', async () => {
    const { id } = await json('create', '--collection', 'Tareas', '--title', 'Shot');
    const { err } = await otea('attach', id, `${ROOT}/x.png`);

    expect(err).toMatch(/Program Files.Git.x\.png/);
  });
});
