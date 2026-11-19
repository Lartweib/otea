import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAgents } from '../app/presence.ts';
import { openProject } from '../app/project.ts';
import { AGENT_GUIDE } from '../core/agent-guide.ts';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS, INIT_NEXT } from './commands.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// The profile connect gives the agent it pins.
const PROFILE = ['--model', 'claude-opus-5-5', '--effort', 'high'];

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

const BLOCK = [
  '<!-- otea:begin -->',
  '## Otea',
  '',
  'This project hands work between humans and agents through Otea. Run `otea next` (or call the `next` tool of the Otea MCP server) to get the item to take and what its step asks, and `otea board <name>` (the `board` tool) to read the instructions of a board. Hand off with `otea handoff <id>`; `otea show <id>` says what to do next with each item.',
  '',
  'The guide below is as it was when this block was written. A rule the project turned on since (such as Topics) is not here: `otea board` (the `board` tool) prints the guide as it stands now.',
  '',
  AGENT_GUIDE,
  '<!-- otea:end -->',
].join('\n');

describe('setup for agents', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const read = (path: string) => readFileSync(join(repo.dir, path), 'utf8');
  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(() => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
  });

  afterEach(() => repo.remove());

  describe('init --agents-md', () => {
    it('never touches AGENTS.md without the flag', async () => {
      await otea('init', '--local');

      expect(existsSync(join(repo.dir, 'AGENTS.md'))).toBe(false);
    });

    it('creates AGENTS.md with the Otea block', async () => {
      const { code, out } = await otea('init', '--local', '--agents-md');

      expect(code).toBe(0);
      expect(read('AGENTS.md')).toBe(`${BLOCK}\n`);
      expect(out).toBe(
        `Project data in ${join(repo.dir, '.otea')}\nAdded the Otea block to ${join(repo.dir, 'AGENTS.md')}\n${INIT_NEXT.join('\n')}\n`,
      );
    });

    it('appends the block to an existing AGENTS.md and keeps what it says', async () => {
      repo.write('AGENTS.md', '# Agents\n\nRun the tests.\n');

      expect((await json('init', '--local', '--agents-md')).agentsMd).toEqual({
        path: join(repo.dir, 'AGENTS.md'),
        action: 'added',
      });
      expect(read('AGENTS.md')).toBe(`# Agents\n\nRun the tests.\n\n${BLOCK}\n`);
    });

    it('is idempotent: running it again changes nothing', async () => {
      repo.write('AGENTS.md', '# Agents\n');
      await otea('init', '--local', '--agents-md');
      const once = read('AGENTS.md');

      expect((await json('init', '--local', '--agents-md')).agentsMd.action).toBe('unchanged');
      expect(read('AGENTS.md')).toBe(once);
    });

    it('replaces an outdated block in place instead of adding a second one', async () => {
      repo.write(
        'AGENTS.md',
        '# Agents\n\n<!-- otea:begin -->\nold words\n<!-- otea:end -->\n\n## Style\n',
      );

      expect((await json('init', '--local', '--agents-md')).agentsMd.action).toBe('updated');
      expect(read('AGENTS.md')).toBe(`# Agents\n\n${BLOCK}\n\n## Style\n`);
    });
  });

  describe('connect', () => {
    let id: string;

    beforeEach(async () => {
      await otea('init', '--local');
      id = (await json('projects', 'current')).id;
    });

    // The server an agent adds to its own harness: pinned to the project, naming no agent.
    const entry = () => ({
      command: 'node',
      args: ['--disable-warning=ExperimentalWarning', MAIN, 'mcp', '--project', id],
    });

    // Whether the desk shows the agent asked for MCP and was never heard through it.
    const missing = (name: string) => {
      const project = openProject(repo.dir);
      try {
        return listAgents(project.db).find((agent) => agent.name === name)?.mcpMissing;
      } finally {
        project.db.close();
      }
    };

    it('refuses a pinned agent writing to another project, and lets it write to its own', async () => {
      const elsewhere = cliAt(repo.dir, {
        OTEA_AGENT: 'claude-b',
        OTEA_PROJECT_ID: 'other-zzzzzz',
      });
      const refused = await elsewhere('create', '--collection', 'Pedidos', '--title', 'Lost');
      expect(refused.code).toBe(7);
      expect(refused.err).toContain('pinned to the project other-zzzzzz');
      expect(refused.err).toContain(id);

      const own = cliAt(repo.dir, { OTEA_AGENT: 'claude-b', OTEA_PROJECT_ID: id });
      const made = await own(
        'create',
        '--collection',
        'Pedidos',
        '--title',
        'Kept',
        '--field',
        'Qué necesitas=x',
      );
      expect(made.err).toBe('');
      expect(made.code).toBe(0);
    });

    it('names --as and --check in its usage, beside the profile', async () => {
      const { out } = await otea('connect', '--help');

      expect(out).toContain(
        'otea connect [--as <name>] [--model <id>] [--effort <level>] [--harness <name>] [--check]',
      );
    });

    it('writes AGENTS.md and prints the MCP server to add, writing no harness config', async () => {
      const { code, out } = await otea('connect');

      expect(code).toBe(0);
      expect(read('AGENTS.md')).toBe(`${BLOCK}\n`);
      expect(existsSync(join(repo.dir, '.mcp.json'))).toBe(false);
      expect(out).toContain(`Added the Otea block to ${join(repo.dir, 'AGENTS.md')}`);
      // No harness is said to need an import: only one that does not read AGENTS.md.
      expect(out).toContain("if your harness doesn't read AGENTS.md, import it");
      expect(out).not.toContain('Claude Code reads CLAUDE.md');
      expect(out).toContain(
        "add this MCP server to your harness's MCP config yourself, for this project only",
      );
      expect(out).toContain('Never edit your user or global config');
      expect(out).toMatch(/^ {2}name {5}otea$/m);
      expect(out).toMatch(/^ {2}command {2}node$/m);
      expect(out).toContain(`As JSON: ${JSON.stringify({ otea: entry() })}`);
      // The JSON is one shape among many: the agent translates it or uses its harness's own command,
      // and the usual project files are named as examples only.
      expect(out).toContain("translate it to your harness's schema");
      expect(out).toContain('mcp add');
      expect(out).toContain('Claude Code: .mcp.json');
      expect(out).toContain('OpenCode: opencode.json');
      expect(out).toContain('environment');
      expect(out.trimEnd().split('\n').at(-1)).toMatch(/^Run otea connect --check now/);
    });

    it('prints the server and what it did with AGENTS.md with --json', async () => {
      expect(await json('connect')).toEqual({
        agentsMd: { path: join(repo.dir, 'AGENTS.md'), action: 'created' },
        mcp: { name: 'otea', ...entry() },
      });
    });

    it('carries an Otea home set apart, so the server finds the same projects', async () => {
      const home = join(repo.dir, 'my home');
      const custom = cliAt(repo.dir, { OTEA_HOME: home });
      await custom('init', '--local');
      const own = JSON.parse((await custom('projects', 'current', '--json')).out).id;

      const { mcp } = JSON.parse((await custom('connect', '--json')).out);

      expect(mcp).toEqual({
        name: 'otea',
        command: 'node',
        args: ['--disable-warning=ExperimentalWarning', MAIN, 'mcp', '--project', own],
        env: { OTEA_HOME: home },
      });
    });

    it('prints the otea command when otea is on PATH, so the config survives a moved checkout', async () => {
      const bin = join(repo.dir, 'bin');
      mkdirSync(bin);
      writeFileSync(join(bin, 'otea'), '#!/bin/sh\n');
      chmodSync(join(bin, 'otea'), 0o755);
      writeFileSync(join(bin, 'otea.cmd'), '@echo off\r\n');
      const onPath = cliAt(repo.dir, { PATH: bin });

      const { mcp } = JSON.parse((await onPath('connect', '--json')).out);
      const { out } = await onPath('connect');

      // A harness on Windows starts no .cmd shim by itself: cmd /c runs it.
      const command =
        process.platform === 'win32'
          ? { command: 'cmd', args: ['/c', 'otea', 'mcp', '--project', id] }
          : { command: 'otea', args: ['mcp', '--project', id] };
      expect(mcp).toEqual({ name: 'otea', ...command });
      expect(out).toContain(`As JSON: ${JSON.stringify({ otea: command })}`);
      expect(out).not.toContain('main.ts');
    });

    it('writes AGENTS.md in the worktree it runs in, not in the main checkout', async () => {
      const git = (...args: string[]) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
          cwd: repo.dir,
          stdio: 'ignore',
        });
      git('commit', '--quiet', '--allow-empty', '-m', 'first');
      const tree = join(repo.dir, 'wt');
      git('worktree', 'add', '--quiet', '--detach', tree);

      const { agentsMd } = JSON.parse((await cliAt(tree)('connect', '--json')).out);

      expect(agentsMd).toEqual({ path: join(tree, 'AGENTS.md'), action: 'created' });
      expect(readFileSync(join(tree, 'AGENTS.md'), 'utf8')).toBe(`${BLOCK}\n`);
      expect(existsSync(join(repo.dir, 'AGENTS.md'))).toBe(false);
    });

    it('declares the profile of the agent named, and the desk warns until it is heard over MCP', async () => {
      const { code } = await otea('connect', '--as', 'claude-b', ...PROFILE);

      expect(code).toBe(0);
      expect(missing('claude-b')).toBe(true);
      const profile = JSON.parse(
        (await cliAt(repo.dir, { OTEA_AGENT: 'claude-b' })('profile', '--json')).out,
      );
      expect(profile.profile).toMatchObject({
        model: 'claude-opus-5-5',
        effort: 'high',
        // No harness named: it works through the command line until its MCP client names one.
        harness: 'cli',
      });
    });

    // P8-R2-3: connect after profile --harness opencode reset the harness to cli and left the
    // profile unconfirmed, so next refused with profile_required.
    it('keeps the harness the agent declared, and its profile confirmed when unchanged', async () => {
      const agent = cliAt(repo.dir, { OTEA_AGENT: 'pc' });
      await agent('profile', ...PROFILE, '--harness', 'opencode');

      const { code, out } = await agent('connect', ...PROFILE);

      expect(code).toBe(0);
      const profile = JSON.parse((await agent('profile', '--json')).out);
      expect(profile).toMatchObject({
        profile: { model: 'claude-opus-5-5', effort: 'high', harness: 'opencode' },
        confirmed: true,
      });
      expect(out).not.toContain('not confirmed');
      const next = await agent('next');
      expect(next.err).not.toContain('profile_required');
      expect(next.err).not.toContain('not confirmed in this session');
    });

    it('requires the profile of an agent named that never declared one', async () => {
      const { code, err } = await otea('connect', '--as', 'claude-b');

      expect(code).toBe(2);
      expect(err).toContain('--model <id> --effort <level>');
    });

    it('says, with --check, that nobody reached Otea over MCP yet', async () => {
      await otea('connect', '--as', 'claude-b', ...PROFILE);

      const { code, out } = await otea('connect', '--check', '--as', 'claude-b');

      expect(code).toBe(11);
      expect(out).toContain('claude-b has not reached Otea through its MCP server');
      expect(out).toContain('your harness runs another otea server');
      expect((await otea('connect', '--check')).out).toMatch(
        /^No agent has reached Otea through its MCP server/,
      );
    });

    it('says, with --check, that the agent was heard over MCP, and the desk stops warning', async () => {
      await otea('connect', '--as', 'claude-b', ...PROFILE);
      const client = new Client({ name: 'opencode', version: '1.4.0' });
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      await createMcpServer(COMMANDS, { cwd: repo.dir, warn: () => {} }).connect(serverSide);
      await client.connect(clientSide);
      try {
        const called = await client.callTool({ name: 'list', arguments: { as: 'claude-b' } });
        expect(called.isError).toBeFalsy();
      } finally {
        await client.close();
      }

      const { code, out } = await otea('connect', '--check', '--as', 'claude-b');

      expect(code).toBe(0);
      expect(out).toMatch(
        /^MCP works: claude-b was heard through Otea's MCP server .* \(opencode\)$/m,
      );
      expect(missing('claude-b')).toBe(false);
    });

    it('points at the otea entry an older connect left in .mcp.json', async () => {
      repo.write(
        '.mcp.json',
        JSON.stringify({ mcpServers: { otea: { command: 'node', args: ['mcp', '--as', 'x'] } } }),
      );

      const { out } = await otea('connect');

      expect(out).toContain(
        `${join(repo.dir, '.mcp.json')} still has the otea entry an older otea connect wrote`,
      );
    });

    it.each([
      'Claude',
      'claude b',
      '-claude',
      'claude-',
      'claude--b',
      'a-very-long-agent-name-indeed',
      'you',
      'human',
    ])('refuses %j with invalid_agent_name', async (name) => {
      const { code, err } = await otea('connect', `--as=${name}`, '--json');

      expect(code).toBe(6);
      expect(JSON.parse(err).error.code).toBe('invalid_agent_name');
      expect(existsSync(join(repo.dir, 'AGENTS.md'))).toBe(false);
    });

    it('fails with not_found before init', async () => {
      const bare = tempGitRepo();
      try {
        expect((await cliAt(bare.dir)('connect', '--as', 'claude', ...PROFILE)).code).toBe(3);
      } finally {
        bare.remove();
      }
    });
  });
});
