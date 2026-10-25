import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

describe('commands', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = (...argv: string[]) => JSON.parse(otea(...argv, '--json').out);

  beforeEach(() => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
  });

  afterEach(() => repo.remove());

  it('fails with not_found before init', () => {
    const { code, err } = otea('collection', 'add', 'tasks');

    expect(code).toBe(3);
    expect(err).toContain('run init first');
  });

  describe('with a project', () => {
    beforeEach(() => {
      otea('init');
    });

    describe('collection add', () => {
      it('adds a collection with the tasks workflow', () => {
        const { code, out } = otea('collection', 'add', 'tasks');

        expect(code).toBe(0);
        expect(out).toBe('Added collection "tasks" (ids TASKS-<n>)\n');
      });

      it('prints the collection with --json', () => {
        expect(json('collection', 'add', 'bugs')).toMatchObject({
          name: 'bugs',
          prefix: 'BUGS',
          nextSeq: 1,
          workflow: { name: 'tasks', initial: 'todo' },
        });
      });

      it('fails with already_exists for a duplicate', () => {
        otea('collection', 'add', 'tasks');

        expect(otea('collection', 'add', 'tasks').code).toBe(5);
      });

      it('fails with invalid_name for an unusable name', () => {
        expect(otea('collection', 'add', '!!').code).toBe(6);
      });

      it('requires the name', () => {
        const { code, err } = otea('collection', 'add');

        expect(code).toBe(2);
        expect(err).toContain('Usage: otea collection add <name>');
      });
    });

    describe('create', () => {
      beforeEach(() => {
        otea('collection', 'add', 'tasks');
      });

      it('prints the new id', () => {
        expect(otea('create', '--collection', 'tasks', '--title', 'First')).toMatchObject({
          code: 0,
          out: 'TASKS-1\n',
        });
        expect(otea('create', '--collection', 'tasks', '--title', 'Second').out).toBe('TASKS-2\n');
      });

      it('prints the item with --json', () => {
        const item = json('create', '--collection', 'tasks', '--title', 'First', '--body', 'Why');

        expect(item).toMatchObject({
          id: 'TASKS-1',
          title: 'First',
          body: 'Why',
          state: 'todo',
          turn: 'agent',
          createdBy: { kind: 'agent', name: 'agent' },
        });
      });

      it('records the actor from OTEA_AGENT', () => {
        otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });

        expect(json('create', '--collection', 'tasks', '--title', 'X').createdBy).toEqual({
          kind: 'agent',
          name: 'claude',
        });
      });

      it('prefers --as over OTEA_AGENT', () => {
        otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });

        const item = json('create', '--collection', 'tasks', '--title', 'X', '--as', 'codex');

        expect(item.createdBy).toEqual({ kind: 'agent', name: 'codex' });
      });

      it('requires --title with the command usage', () => {
        const { code, err } = otea('create', '--collection', 'tasks');

        expect(code).toBe(2);
        expect(err).toContain('Missing --title');
        expect(err).toContain(
          'Usage: otea create --collection <collection> --title <title> [--body <body>]',
        );
      });

      it('fails with not_found for an unknown collection', () => {
        expect(otea('create', '--collection', 'nope', '--title', 'X').code).toBe(3);
      });
    });

    describe('with items', () => {
      beforeEach(() => {
        otea('collection', 'add', 'tasks');
        otea('collection', 'add', 'bugs');
        otea('create', '--collection', 'tasks', '--title', 'Write docs', '--body', 'For v1');
        otea('create', '--collection', 'bugs', '--title', 'Fix login');
        otea('move', 'BUGS-1', 'in_progress');
        otea('move', 'BUGS-1', 'review');
      });

      describe('list', () => {
        it('prints aligned columns: id, state, turn, title', () => {
          expect(otea('list')).toMatchObject({
            code: 0,
            out: 'TASKS-1  todo    agent  Write docs\nBUGS-1   review  human  Fix login\n',
          });
        });

        it.each([
          [['--turn', 'human'], ['BUGS-1']],
          [['--state', 'todo'], ['TASKS-1']],
          [['--collection', 'tasks'], ['TASKS-1']],
          [['--collection', 'tasks', '--turn', 'human'], []],
        ])('filters with %j', (filters, ids) => {
          const items: Array<{ id: string }> = json('list', ...filters);

          expect(items.map((item) => item.id)).toEqual(ids);
        });

        it('says so when nothing matches', () => {
          expect(otea('list', '--state', 'done').out).toBe('No items.\n');
        });

        it('rejects an unknown turn', () => {
          const { code, err } = otea('list', '--turn', 'robot');

          expect(code).toBe(2);
          expect(err).toContain('--turn must be one of human, agent, none');
        });

        it('rejects options of other commands', () => {
          expect(otea('list', '--title', 'X').code).toBe(2);
        });
      });

      describe('show', () => {
        it('prints the item and its events timeline', () => {
          const { code, out } = otea('show', 'TASKS-1');

          expect(code).toBe(0);
          expect(out).toContain('TASKS-1  Write docs');
          expect(out).toContain('state: todo  turn: agent  collection: tasks');
          expect(out).toContain('For v1');
          expect(out).toMatch(/agent:agent {2}created {2}todo/);
        });

        it('prints transitions in order', () => {
          const lines = otea('show', 'BUGS-1').out.split('\n');
          const events = lines.slice(lines.indexOf('Events:') + 1).filter(Boolean);

          expect(events).toHaveLength(3);
          expect(events[1]).toMatch(/transitioned {2}todo -> in_progress$/);
          expect(events[2]).toMatch(/transitioned {2}in_progress -> review$/);
        });

        it('prints the item with events with --json', () => {
          const item = json('show', 'BUGS-1');

          expect(item).toMatchObject({ id: 'BUGS-1', state: 'review', turn: 'human' });
          expect(item.events.map((event: { type: string }) => event.type)).toEqual([
            'created',
            'transitioned',
            'transitioned',
          ]);
        });

        it('fails with not_found for an unknown id', () => {
          expect(otea('show', 'TASKS-9').code).toBe(3);
        });
      });

      describe('move', () => {
        it('prints the moved item as a list row', () => {
          expect(otea('move', 'TASKS-1', 'in_progress')).toMatchObject({
            code: 0,
            out: 'TASKS-1  in_progress  agent  Write docs\n',
          });
        });

        it('records the acting agent', () => {
          otea('move', 'TASKS-1', 'in_progress', '--as', 'codex');

          expect(json('show', 'TASKS-1').events[1].actor).toEqual({ kind: 'agent', name: 'codex' });
        });

        it('fails with invalid_transition and a JSON error', () => {
          const { code, out, err } = otea('move', 'TASKS-1', 'done', '--json');

          expect(code).toBe(4);
          expect(out).toBe('');
          expect(JSON.parse(err)).toEqual({
            error: { code: 'invalid_transition', message: 'Cannot move from "todo" to "done"' },
          });
        });

        it('requires the target state', () => {
          const { code, err } = otea('move', 'TASKS-1');

          expect(code).toBe(2);
          expect(err).toContain('Usage: otea move <id> <state>');
        });
      });
    });
  });
});
