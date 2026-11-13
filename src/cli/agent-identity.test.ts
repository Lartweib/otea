import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAgents } from '../app/presence.ts';
import { openProject } from '../app/project.ts';
import { type Cli, cliAt, declareProfiles, presetCollection, tempGitRepo } from './testing.ts';

// An agent's name is its identity: every agent command needs one, there is no default, and one
// rule says which names are valid wherever a name is given.
describe('agent identity on the CLI', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let unnamed: Cli;

  const errorOf = async (cli: Cli, ...argv: string[]) => {
    const result = await cli(...argv, '--json');
    return { code: result.code, error: JSON.parse(result.err).error };
  };

  const agents = () => {
    const project = openProject(repo.dir);
    try {
      return listAgents(project.db).map(({ name }) => name);
    } finally {
      project.db.close();
    }
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    unnamed = cliAt(repo.dir);
    await unnamed('init', '--local');
    declareProfiles(repo.dir, 'claude');
    presetCollection(repo.dir, 'tasks');
    await cliAt(repo.dir, { OTEA_AGENT: 'claude' })(
      'create',
      '--collection',
      'tasks',
      '--title',
      'First',
      '--description',
      'D',
    );
  });

  afterEach(() => repo.remove());

  it.each([['claim', 'TASKS-1'], ['next'], ['list'], ['show', 'TASKS-1']])(
    'refuses "otea %s" without a name, saying how to name yourself',
    async (...argv) => {
      const { code, error } = await errorOf(unnamed, ...argv);

      expect(code).toBe(2);
      expect(error.code).toBe('unnamed_agent');
      expect(error.message).toContain('--as <name>');
      expect(error.message).toContain('OTEA_AGENT');
    },
  );

  it('never records an unnamed agent', async () => {
    await unnamed('claim', 'TASKS-1');

    expect(agents()).toEqual(['claude']);
  });

  it.each(['Claude', 'claude_b', 'you', 'agent', 'x'.repeat(25)])(
    'refuses %s as an agent name on claim as connect does, with exit 6',
    async (name) => {
      const claim = await errorOf(unnamed, 'claim', 'TASKS-1', '--as', name);
      const connect = await errorOf(unnamed, 'connect', '--as', name);

      expect(claim.code).toBe(6);
      expect(claim.error.code).toBe('invalid_agent_name');
      expect(connect.error).toEqual(claim.error);
    },
  );

  it('validates OTEA_AGENT as it validates --as', async () => {
    const shouting = cliAt(repo.dir, { OTEA_AGENT: 'CLAUDE' });

    expect((await errorOf(shouting, 'claim', 'TASKS-1')).error.code).toBe('invalid_agent_name');
  });

  it('acts as the name --as gives, before OTEA_AGENT', async () => {
    const otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    declareProfiles(repo.dir, 'codex');
    const item = JSON.parse((await otea('claim', 'TASKS-1', '--as', 'codex', '--json')).out);

    expect(item.lease.holder).toBe('codex');
  });

  it('runs setup commands without a name', async () => {
    expect((await unnamed('projects', 'current')).code).toBe(0);
  });
});
