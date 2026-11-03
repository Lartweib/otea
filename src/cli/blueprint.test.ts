import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

const PRODUCT_PLAYBOOK = readFileSync(
  new URL('../../blueprints/product/playbook.md', import.meta.url),
  'utf8',
);

// A project blueprint the tests edit, as a team edits the one it shares.
const STUDIO = `blueprint: studio
blueprint_version: 1
playbook: ./playbook.md
boards:
  work: { preset: tasks }
  bugs: { preset: bug-triage }
connections:
  - bugs.bug blocks work.task
`;

describe('blueprints', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  const errorOf = async (...argv: string[]) => {
    const result = await otea(...argv, '--json');
    return {
      code: result.code,
      error: JSON.parse(result.err).error as { code: string; message: string },
    };
  };
  const writeStudio = (yaml: string, playbook = 'Coordinate the studio.\n') => {
    repo.write('.otea/blueprints/studio/blueprint.yaml', yaml);
    repo.write('.otea/blueprints/studio/playbook.md', playbook);
  };
  const create = async (collection: string, title: string) =>
    (await json('create', '--collection', collection, '--title', title, '--description', 'D')).id;

  beforeEach(() => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
  });

  afterEach(() => repo.remove());

  describe('init --blueprint', () => {
    it('creates every board of an official blueprint and keeps a copy in the data folder', async () => {
      const result = await otea('init', '--local', '--blueprint', 'product');

      expect(result.code).toBe(0);
      expect(result.out).toContain(
        'Built from blueprint product v1: work (tasks), bugs (bug-triage)',
      );
      const collections = await json('playbook');
      expect(
        collections.collections.map(({ name, preset }: { name: string; preset: string }) => [
          name,
          preset,
        ]),
      ).toEqual([
        ['work', 'tasks'],
        ['bugs', 'bug-triage'],
      ]);
      const copy = readFileSync(join(repo.dir, '.otea', 'blueprint.yaml'), 'utf8');
      expect(copy).toContain('blueprint: product');
      expect(copy).toContain('origin: official');
      expect(readFileSync(join(repo.dir, '.otea', 'blueprint.md'), 'utf8')).toBe(PRODUCT_PLAYBOOK);
    });

    it('builds from a blueprint at a path', async () => {
      repo.write('shared/studio/blueprint.yaml', STUDIO);
      repo.write('shared/studio/playbook.md', 'Coordinate.\n');

      const data = await json('init', '--local', '--blueprint', './shared/studio');

      expect(data.blueprint).toMatchObject({ name: 'studio', version: 1 });
      expect(readFileSync(join(repo.dir, '.otea', 'blueprint.yaml'), 'utf8')).toContain(
        'origin: path',
      );
    });

    it('refuses --blueprint with --join', async () => {
      expect((await otea('init', '--join', 'x', '--blueprint', 'product')).code).toBe(2);
    });

    it('refuses an unknown blueprint with exit 3', async () => {
      expect(await errorOf('init', '--local', '--blueprint', 'nope')).toMatchObject({
        code: 3,
        error: { code: 'not_found' },
      });
    });
  });

  describe('blueprint apply', () => {
    beforeEach(async () => {
      await otea('init', '--local');
    });

    it('adds the boards to an existing project, reusing a collection of the same preset', async () => {
      await otea('collection', 'add', 'work');

      const data = await json('blueprint', 'apply', 'product');

      expect(data.boards).toEqual([
        { name: 'work', preset: 'tasks', action: 'kept' },
        { name: 'bugs', preset: 'bug-triage', action: 'created' },
      ]);
    });

    it('refuses a board whose collection exists with another preset, creating nothing', async () => {
      await otea('collection', 'add', 'bugs');

      expect(await errorOf('blueprint', 'apply', 'product')).toMatchObject({
        code: 5,
        error: { code: 'already_exists' },
      });
      expect((await json('playbook')).collections).toHaveLength(1);
      expect(existsSync(join(repo.dir, '.otea', 'blueprint.yaml'))).toBe(false);
    });

    it('refuses a second blueprint; update brings in changes instead', async () => {
      await otea('blueprint', 'apply', 'product');

      expect(await errorOf('blueprint', 'apply', 'product')).toMatchObject({
        code: 5,
        error: { code: 'already_exists' },
      });
    });

    it('refuses an invalid blueprint with exit 9, listing its problems', async () => {
      writeStudio(STUDIO.replace('bugs.bug blocks', 'bugs.bug parent'));

      const { code, error } = await errorOf('blueprint', 'apply', 'studio');

      expect(code).toBe(9);
      expect(error.code).toBe('invalid_blueprint');
      expect(error.message).toContain('parent links stay inside one board');
    });
  });

  describe('links', () => {
    beforeEach(async () => {
      await otea('init', '--local', '--blueprint', 'product');
      await otea('collection', 'add', 'notes');
      await create('work', 'Ship the farm');
      await create('work', 'Plant seeds');
      await create('bugs', 'Crops vanish');
      await create('notes', 'Ideas');
    });

    it('allows a link the blueprint declares', async () => {
      const result = await otea('link', 'BUGS-1', 'blocks', 'WORK-1');

      expect(result).toMatchObject({ code: 0, out: 'BUGS-1 blocks WORK-1\n' });
    });

    it('refuses an undeclared link between two boards with exit 16, listing what is allowed', async () => {
      const { code, error } = await errorOf('link', 'WORK-1', 'blocks', 'BUGS-1');

      expect(code).toBe(16);
      expect(error).toEqual({
        code: 'link_not_in_blueprint',
        message:
          'The blueprint "product" does not allow WORK-1 blocks BUGS-1 (work.task blocks bugs.bug); between work and bugs it allows: bugs.bug blocks work.task',
      });
    });

    it('leaves links within a board, parents and boards outside the blueprint alone', async () => {
      expect((await otea('link', 'WORK-2', 'blocks', 'WORK-1')).code).toBe(0);
      expect((await otea('link', 'WORK-2', 'parent', 'WORK-1')).code).toBe(0);
      expect((await otea('link', 'NOTES-1', 'relates', 'BUGS-1')).code).toBe(0);
    });

    it('leaves a parent across boards to its own rule, not the blueprint', async () => {
      expect((await errorOf('link', 'BUGS-1', 'parent', 'WORK-1')).error.code).toBe(
        'parent_across_boards',
      );
    });
  });

  describe('status and update', () => {
    beforeEach(async () => {
      writeStudio(STUDIO);
      await otea('init', '--local', '--blueprint', 'studio');
    });

    it('says the copy is up to date with its source', async () => {
      const result = await otea('blueprint', 'status');

      expect(result).toMatchObject({ code: 0 });
      expect(result.out).toContain('studio v1 (project blueprint): up to date');
    });

    it('shows what changed in the source and applies it after confirmation', async () => {
      writeStudio(
        STUDIO.replace('blueprint_version: 1', 'blueprint_version: 2').replace(
          'connections:',
          '  art: { preset: tasks }\nconnections:\n  - art.task implements work.task',
        ),
        'Coordinate the studio, art included.\n',
      );

      const status = await otea('blueprint', 'status');
      expect(status.out).toContain(
        [
          'studio v1 (project blueprint): the source changed',
          '  version 1 -> 2',
          '  + board art (preset tasks)',
          '  + art.task implements work.task',
          '  ~ playbook',
        ].join('\n'),
      );
      const validate = await otea('validate');
      expect(validate.out).toContain('the source changed since it was copied');

      const asked: string[] = [];
      const confirming = cliAt(repo.dir, {}, undefined, undefined, async (question) => {
        asked.push(question);
        return 'y';
      });
      const update = await confirming('blueprint', 'update');

      expect(update.code).toBe(0);
      expect(asked).toEqual(['Apply these changes? [y/N] ']);
      expect(update.out).toContain('Created board art (preset tasks)');
      expect((await otea('blueprint', 'status')).out).toContain(
        'studio v2 (project blueprint): up to date',
      );
      await create('art', 'Draw the wolf');
      await create('work', 'Ship');
      expect((await otea('link', 'ART-1', 'implements', 'WORK-1')).code).toBe(0);
      expect((await otea('playbook')).out).toContain('Coordinate the studio, art included.');
    });

    it('applies nothing when the answer is no, and asks for --yes with nobody to ask', async () => {
      writeStudio(STUDIO.replace('connections:', '  art: { preset: tasks }\nconnections:'));
      const declining = cliAt(repo.dir, {}, undefined, undefined, async () => 'n');

      expect((await declining('blueprint', 'update')).out).toContain('Nothing applied');
      expect((await otea('blueprint', 'update')).code).toBe(2);
      expect((await otea('blueprint', 'status')).out).toContain('the source changed');
    });

    it('never deletes a board that has items: it keeps it and reports it', async () => {
      await create('bugs', 'Crops vanish');
      writeStudio(
        STUDIO.replace('  bugs: { preset: bug-triage }\n', '').replace(
          '  - bugs.bug blocks work.task\n',
          '',
        ),
      );

      const update = await json('blueprint', 'update', '--yes');

      expect(update.kept).toEqual([
        'Kept board bugs: it has 1 item, and a board with items is never deleted',
      ]);
      expect(
        (await json('playbook')).collections.map(({ name }: { name: string }) => name),
      ).toContain('bugs');
      expect((await otea('blueprint', 'status')).out).toContain('- board bugs (preset bug-triage)');
    });

    it('removes a board that has no items', async () => {
      writeStudio(
        STUDIO.replace('  bugs: { preset: bug-triage }\n', '').replace(
          '  - bugs.bug blocks work.task\n',
          '',
        ),
      );

      const update = await json('blueprint', 'update', '--yes');

      expect(update.applied).toContain('Removed board bugs (it had no items)');
      expect(
        (await json('playbook')).collections.map(({ name }: { name: string }) => name),
      ).toEqual(['work']);
    });

    it('says when the source is gone, and refuses to update from it with exit 3', async () => {
      rmSync(join(repo.dir, '.otea', 'blueprints', 'studio'), { recursive: true });

      expect((await otea('blueprint', 'status')).out).toContain(
        'studio v1 (project blueprint): its source cannot be read: the project blueprint "studio" no longer exists',
      );
      expect((await otea('blueprint', 'update', '--yes')).code).toBe(3);
      expect((await otea('validate')).out).toContain('its source cannot be read');
    });

    it('fails with exit 3 when the project has no blueprint', async () => {
      const bare = tempGitRepo();
      try {
        const other = cliAt(bare.dir);
        await other('init', '--local');
        const result = await other('blueprint', 'status', '--json');
        expect(result.code).toBe(3);
      } finally {
        bare.remove();
      }
    });
  });

  describe('playbook and validate', () => {
    it('adds the coordination playbook to the playbook index', async () => {
      await otea('init', '--local', '--blueprint', 'product');

      const { out } = await otea('playbook');

      expect(out).toContain('otea playbook --collection bugs');
      expect(out).toContain(PRODUCT_PLAYBOOK.trimEnd());
      expect((await json('playbook')).blueprint).toEqual({
        name: 'product',
        playbook: PRODUCT_PLAYBOOK,
      });
    });

    it('reports a project blueprint with unknown presets and types', async () => {
      await otea('init', '--local');
      writeStudio(
        STUDIO.replace('preset: bug-triage', 'preset: bugz').replace('work.task', 'work.story'),
      );

      const result = await otea('validate');

      expect(result.code).toBe(10);
      expect(result.out).toContain('boards.bugs.preset: Preset "bugz" not found');
      expect(result.out).toContain('board work (preset tasks) has no type "story"');
    });
  });
});
