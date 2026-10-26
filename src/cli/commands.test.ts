import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

describe('commands', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(() => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
  });

  afterEach(() => repo.remove());

  it('fails with not_found before init', async () => {
    const { code, err } = await otea('collection', 'add', 'tasks');

    expect(code).toBe(3);
    expect(err).toContain('run init first');
  });

  describe('with a project', () => {
    beforeEach(async () => {
      await otea('init');
    });

    describe('collection add', () => {
      it('adds a collection with the tasks workflow', async () => {
        const { code, out } = await otea('collection', 'add', 'tasks');

        expect(code).toBe(0);
        expect(out).toBe('Added collection "tasks" (ids TASKS-<n>)\n');
      });

      it('prints the collection with --json', async () => {
        expect(await json('collection', 'add', 'bugs')).toMatchObject({
          name: 'bugs',
          prefix: 'BUGS',
          nextSeq: 1,
          workflow: { name: 'tasks', initial: 'todo' },
        });
      });

      it('fails with already_exists for a duplicate', async () => {
        await otea('collection', 'add', 'tasks');

        expect((await otea('collection', 'add', 'tasks')).code).toBe(5);
      });

      it('fails with invalid_name for an unusable name', async () => {
        expect((await otea('collection', 'add', '!!')).code).toBe(6);
      });

      it('requires the name', async () => {
        const { code, err } = await otea('collection', 'add');

        expect(code).toBe(2);
        expect(err).toContain('Usage: otea collection add <name>');
      });
    });

    describe('create', () => {
      beforeEach(async () => {
        await otea('collection', 'add', 'tasks');
      });

      it('prints the new id', async () => {
        expect(await otea('create', '--collection', 'tasks', '--title', 'First')).toMatchObject({
          code: 0,
          out: 'TASKS-1\n',
        });
        expect((await otea('create', '--collection', 'tasks', '--title', 'Second')).out).toBe(
          'TASKS-2\n',
        );
      });

      it('prints the item with --json', async () => {
        const item = await json(
          'create',
          '--collection',
          'tasks',
          '--title',
          'First',
          '--body',
          'Why',
        );

        expect(item).toMatchObject({
          id: 'TASKS-1',
          title: 'First',
          body: 'Why',
          state: 'todo',
          turn: 'agent',
          createdBy: { kind: 'agent', name: 'agent' },
        });
      });

      it('records the actor from OTEA_AGENT', async () => {
        otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });

        expect((await json('create', '--collection', 'tasks', '--title', 'X')).createdBy).toEqual({
          kind: 'agent',
          name: 'claude',
        });
      });

      it('prefers --as over OTEA_AGENT', async () => {
        otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });

        const item = await json('create', '--collection', 'tasks', '--title', 'X', '--as', 'codex');

        expect(item.createdBy).toEqual({ kind: 'agent', name: 'codex' });
      });

      it('requires --title with the command usage', async () => {
        const { code, err } = await otea('create', '--collection', 'tasks');

        expect(code).toBe(2);
        expect(err).toContain('Missing --title');
        expect(err).toContain(
          'Usage: otea create --collection <collection> --title <title> [--body <body>]',
        );
      });

      it('fails with not_found for an unknown collection', async () => {
        expect((await otea('create', '--collection', 'nope', '--title', 'X')).code).toBe(3);
      });
    });

    describe('with items', () => {
      beforeEach(async () => {
        await otea('collection', 'add', 'tasks');
        await otea('collection', 'add', 'bugs');
        await otea('create', '--collection', 'tasks', '--title', 'Write docs', '--body', 'For v1');
        await otea('create', '--collection', 'bugs', '--title', 'Fix login');
        await otea('move', 'BUGS-1', 'in_progress');
        await otea('move', 'BUGS-1', 'review');
      });

      describe('list', () => {
        it('prints aligned columns: id, state, turn, title', async () => {
          expect(await otea('list')).toMatchObject({
            code: 0,
            out: 'TASKS-1  todo    agent  Write docs\nBUGS-1   review  human  Fix login\n',
          });
        });

        it.each([
          [['--turn', 'human'], ['BUGS-1']],
          [['--state', 'todo'], ['TASKS-1']],
          [['--collection', 'tasks'], ['TASKS-1']],
          [['--collection', 'tasks', '--turn', 'human'], []],
        ])('filters with %j', async (filters, ids) => {
          const items: Array<{ id: string }> = await json('list', ...filters);

          expect(items.map((item) => item.id)).toEqual(ids);
        });

        it('says so when nothing matches', async () => {
          expect((await otea('list', '--state', 'done')).out).toBe('No items.\n');
        });

        it('rejects an unknown turn', async () => {
          const { code, err } = await otea('list', '--turn', 'robot');

          expect(code).toBe(2);
          expect(err).toContain('--turn must be one of human, agent, none');
        });

        it('rejects options of other commands', async () => {
          expect((await otea('list', '--title', 'X')).code).toBe(2);
        });
      });

      describe('show', () => {
        it('prints the item and its events timeline', async () => {
          const { code, out } = await otea('show', 'TASKS-1');

          expect(code).toBe(0);
          expect(out).toContain('TASKS-1  Write docs');
          expect(out).toContain('state: todo  turn: agent  collection: tasks');
          expect(out).toContain('For v1');
          expect(out).toMatch(/agent:agent {2}created {2}todo/);
        });

        it('prints transitions in order', async () => {
          const lines = (await otea('show', 'BUGS-1')).out.split('\n');
          const events = lines.slice(lines.indexOf('Events:') + 1).filter(Boolean);

          expect(events).toHaveLength(3);
          expect(events[1]).toMatch(/transitioned {2}todo -> in_progress$/);
          expect(events[2]).toMatch(/transitioned {2}in_progress -> review$/);
        });

        it('prints the item with events with --json', async () => {
          const item = await json('show', 'BUGS-1');

          expect(item).toMatchObject({ id: 'BUGS-1', state: 'review', turn: 'human' });
          expect(item.events.map((event: { type: string }) => event.type)).toEqual([
            'created',
            'transitioned',
            'transitioned',
          ]);
        });

        it('fails with not_found for an unknown id', async () => {
          expect((await otea('show', 'TASKS-9')).code).toBe(3);
        });
      });

      describe('move', () => {
        it('prints the moved item as a list row', async () => {
          expect(await otea('move', 'TASKS-1', 'in_progress')).toMatchObject({
            code: 0,
            out: 'TASKS-1  in_progress  agent  Write docs\n',
          });
        });

        it('records the acting agent', async () => {
          await otea('move', 'TASKS-1', 'in_progress', '--as', 'codex');

          expect((await json('show', 'TASKS-1')).events[1].actor).toEqual({
            kind: 'agent',
            name: 'codex',
          });
        });

        it('fails with invalid_transition and a JSON error', async () => {
          const { code, out, err } = await otea('move', 'TASKS-1', 'done', '--json');

          expect(code).toBe(4);
          expect(out).toBe('');
          expect(JSON.parse(err)).toEqual({
            error: { code: 'invalid_transition', message: 'Cannot move from "todo" to "done"' },
          });
        });

        it('rejects an agent approving work with forbidden', async () => {
          const { code, err } = await otea('move', 'BUGS-1', 'done');

          expect(code).toBe(7);
          expect(err).toContain('requires human-ui authority');
          expect((await json('show', 'BUGS-1')).state).toBe('review');
        });

        it('records an optional --reason and shows it in the timeline', async () => {
          await otea('move', 'TASKS-1', 'in_progress', '--reason', 'Picked up');

          expect((await json('show', 'TASKS-1')).events[1].data).toEqual({
            from: 'todo',
            to: 'in_progress',
            reason: 'Picked up',
          });
          expect((await otea('show', 'TASKS-1')).out).toMatch(
            /transitioned {2}todo -> in_progress \(Picked up\)$/m,
          );
        });

        it('requires the target state', async () => {
          const { code, err } = await otea('move', 'TASKS-1');

          expect(code).toBe(2);
          expect(err).toContain('Usage: otea move <id> <state> [--reason <reason>]');
        });
      });
    });
  });
});
