import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject } from '../app/project.ts';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, presetCollection, tempGitRepo } from './testing.ts';

// One agent, one name across sessions (P2S-5, P3C-7, P6-6, P7-12, P8-3): a new session asks
// otea whoami and gets back the name it worked under from this folder through the same harness,
// while nobody works under it now; a second terminal next to a working agent never gets its name.
describe('otea whoami', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (cli: Cli, ...argv: string[]) =>
    JSON.parse((await cli(...argv, '--json')).out);

  // A session of `name` through `harness`, from the repo, that has since ended.
  const workedHere = async (name: string, harness: string, from = repo.dir) => {
    const agent = cliAt(from, { OTEA_AGENT: name });
    await agent(
      'profile',
      '--model',
      'claude-haiku-4-5',
      '--effort',
      'unknown',
      '--harness',
      harness,
    );
    await agent('list');
  };

  // Moves every sighting ten minutes back: those sessions ended.
  const later = () => {
    const project = openProject(repo.dir);
    try {
      const past = new Date(Date.now() - 10 * 60_000).toISOString();
      project.db.prepare('UPDATE agents SET last_seen = ?').run(past);
    } finally {
      project.db.close();
    }
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init', '--local');
    presetCollection(repo.dir, 'tasks');
  });

  afterEach(() => repo.remove());

  it('gives a returning session of the same harness its name back', async () => {
    await workedHere('ana', 'claude-code');
    later();

    const { code, out } = await otea('whoami', '--harness', 'Claude Code');

    expect(code).toBe(0);
    expect(out).toMatch(/^Reuse your name: ana \(last seen /);
    expect(out).toContain('--as ana');
    expect(await json(otea, 'whoami', '--harness', 'claude-code')).toMatchObject({
      name: 'ana',
      reuse: true,
    });
  });

  it('never gives the name a session works under: a second terminal picks its own', async () => {
    await workedHere('ana', 'claude-code');
    const ana = cliAt(repo.dir, { OTEA_AGENT: 'ana' });
    await ana('create', '--collection', 'tasks', '--title', 'Docs', '--description', 'For v1');
    await ana('claim', 'TASKS-1');

    const { out } = await otea('whoami', '--harness', 'claude-code');

    expect(out).toContain('pick a new short name of your own');
    expect(out).toContain('not one of the agents connected now (ana)');
    expect(await json(otea, 'whoami', '--harness', 'claude-code')).toMatchObject({
      name: null,
      reuse: false,
      working: ['ana'],
    });
  });

  // A session that closed a moment ago comes back under its name, told another may still be at it.
  it('gives back the name of an agent that acted moments ago, saying another terminal may have it', async () => {
    await workedHere('ana', 'claude-code');

    const { out } = await otea('whoami', '--harness', 'claude-code');

    expect(out).toMatch(/^Reuse your name: ana/);
    expect(out).toContain(
      'ana acted moments ago: if another terminal still works as ana, pick a new name instead.',
    );
    expect(await json(otea, 'whoami', '--harness', 'claude-code')).toMatchObject({
      name: 'ana',
      lately: true,
    });
  });

  it('gives no name worked under through another harness, or from another folder', async () => {
    await workedHere('ana', 'claude-code');
    const elsewhere = join(repo.dir, '..', `${repo.dir.split(/[\\/]/).pop()}-wt`);
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd: repo.dir,
        stdio: 'ignore',
      });
    git('commit', '--quiet', '--allow-empty', '-m', 'first');
    execFileSync('git', ['worktree', 'add', '--quiet', '--detach', elsewhere], {
      cwd: repo.dir,
      stdio: 'ignore',
    });
    try {
      await workedHere('bo', 'opencode', elsewhere);
      later();

      expect((await json(otea, 'whoami', '--harness', 'opencode')).name).toBeNull();
      expect((await json(otea, 'whoami', '--harness', 'claude-code')).name).toBe('ana');
      expect((await json(cliAt(elsewhere), 'whoami', '--harness', 'opencode')).name).toBe('bo');
    } finally {
      execFileSync('git', ['worktree', 'remove', '--force', elsewhere], { cwd: repo.dir });
    }
  });

  it('says who you are when you gave a name', async () => {
    const { out } = await cliAt(repo.dir, { OTEA_AGENT: 'ana' })('whoami');

    expect(out).toBe('You are ana: put it on every command (--as ana; MCP tools: as).\n');
  });

  it('reads the harness from the MCP client, needing no name', async () => {
    await workedHere('ana', 'claude-code');
    later();
    const client = new Client({ name: 'claude-code', version: '2.1.0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createMcpServer(COMMANDS, { cwd: repo.dir, warn: () => {} }).connect(serverSide);
    await client.connect(clientSide);
    try {
      const reply = await client.callTool({ name: 'whoami', arguments: {} });

      expect(reply.isError).toBeFalsy();
      const said = JSON.parse((reply.content as { text: string }[])[0]?.text ?? '');
      expect(said).toMatchObject({ name: 'ana', reuse: true });
    } finally {
      await client.close();
    }
  });
});
