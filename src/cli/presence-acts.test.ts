import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAgents, waitBeat } from '../app/presence.ts';
import { openProject } from '../app/project.ts';
import { findAgent } from '../store/queries.ts';
import { type Cli, cliAt, declareProfiles, presetCollection, tempGitRepo } from './testing.ts';

// P1-R3-8: what a subagent runs counts as its acts; the beats of a wait it left running do not, so
// once it released what it held it shows as finished a short while later.
describe('the acts of an agent', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  const SUB = 'claude-haiku-hacer';
  const open = <T>(use: (db: ReturnType<typeof openProject>['db']) => T): T => {
    const project = openProject(repo.dir);
    try {
      return use(project.db);
    } finally {
      project.db.close();
    }
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init');
    declareProfiles(repo.dir, 'claude-haiku', SUB);
    presetCollection(repo.dir, 'tasks');
    await otea(
      'create',
      '--collection',
      'tasks',
      '--title',
      'First',
      '--description',
      'D',
      '--as',
      'claude-haiku',
    );
  });

  afterEach(() => repo.remove());

  it('notes each command it runs as an act, and no beat of its wait', async () => {
    await otea('claim', 'TASKS-1', '--as', SUB);
    await otea('release', 'TASKS-1', '--as', SUB);
    const acted = open((db) => findAgent(db, SUB)?.actedAt);
    expect(acted).toBeTruthy();

    const later = new Date(Date.now() + 120_000).toISOString();
    open((db) =>
      waitBeat(db, { agent: SUB, channel: 'cli', waiter: process.pid }, () => later).run(),
    );
    expect(open((db) => findAgent(db, SUB)?.actedAt)).toBe(acted);
    const shown = open((db) => listAgents(db, () => later).find(({ name }) => name === SUB));
    expect(shown?.live).toBe(false);
  });
});
