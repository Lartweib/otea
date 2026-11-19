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

  it.each([['claim', 'TASKS-1'], ['next'], ['create', '--collection', 'tasks', '--title', 'T']])(
    'refuses "otea %s" without a name, saying how to name yourself',
    async (...argv) => {
      const { code, error } = await errorOf(unnamed, ...argv);

      expect(code).toBe(2);
      expect(error.code).toBe('unnamed_agent');
      expect(error.message).toContain('--as <name>');
      expect(error.message).toContain('OTEA_AGENT');
    },
  );

  it.each([['list'], ['show', 'TASKS-1'], ['events'], ['board'], ['board', 'tasks']])(
    'lets the person read with "otea %s" without a name',
    async (...argv) => {
      const result = await unnamed(...argv);

      expect(result.err).toBe('');
      expect(result.code).toBe(0);
    },
  );

  it('never records a reader without a name as an agent', async () => {
    await unnamed('list');
    await unnamed('show', 'TASKS-1');

    expect(agents()).toEqual(['claude']);
  });

  it('tells the person reading whose turn it is, not that it is theirs', async () => {
    const { out } = await unnamed('show', 'TASKS-1');

    expect(out).toContain("An agent's turn: an agent does this step.");
    expect(out).not.toContain('Your turn');
    expect(out).not.toContain('Claim it first');
  });

  it('still checks the name a reader gives', async () => {
    expect((await errorOf(unnamed, 'list', '--as', 'You')).error.code).toBe('invalid_agent_name');
  });

  it('never records an unnamed agent', async () => {
    await unnamed('claim', 'TASKS-1');

    expect(agents()).toEqual(['claude']);
  });

  // P2S-R2-3: a name first seen on a command that failed showed as a connected agent «sin
  // perfil», and whoami then handed it out.
  it('never records a name first seen on a command that fails', async () => {
    const probe = cliAt(repo.dir, { OTEA_AGENT: 'a2-probe' });
    const failed = await probe('board', 'draft', 'X', '--file', 'nope.json');

    expect(failed.code).not.toBe(0);
    expect(agents()).toEqual(['claude']);
    expect((await probe('list')).code).toBe(0);
    expect(agents()).toContain('a2-probe');
  });

  // P1-R2-4: <name>-<role> runs long, and MCP took a name the CLI refused.
  it('takes a subagent name of up to 40 characters', async () => {
    const name = 'probe-nico-integrar-cam1-2-and-some-more';
    expect(name).toHaveLength(40);

    expect((await cliAt(repo.dir, { OTEA_AGENT: name })('list')).code).toBe(0);
  });

  it.each(['Claude', 'claude_b', 'you', 'agent', 'x'.repeat(41)])(
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
