import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_GUIDE } from '../core/agent-guide.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

const BLOCK = [
  '<!-- otea:begin -->',
  '## Otea',
  '',
  'This project hands work between humans and agents through Otea. Run `otea next` (or call the `next` tool of the Otea MCP server) to get the item to take and what its step asks, and `otea board <name>` (the `board` tool) to read the instructions of a board. Hand off with `otea handoff <id>`; `otea show <id>` says what to do next with each item.',
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
        `${join(repo.dir, '.otea')}\nMade the boards Tareas, Errores\nAdded the Otea block to ${join(repo.dir, 'AGENTS.md')}\n`,
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
    beforeEach(async () => {
      await otea('init', '--local');
    });

    const entry = (name: string) => ({
      command: 'node',
      args: ['--disable-warning=ExperimentalWarning', MAIN, 'mcp', '--as', name],
    });

    it('pins the agent name in the project MCP config', async () => {
      const { code, out } = await otea('connect', '--as', 'claude-b');

      expect(code).toBe(0);
      expect(JSON.parse(read('.mcp.json'))).toEqual({ mcpServers: { otea: entry('claude-b') } });
      expect(out).toBe(
        `Connected "claude-b": ${join(repo.dir, '.mcp.json')} serves otea mcp --as claude-b (kept out of git through .git/info/exclude: it names this machine's path to Otea)\n`,
      );
    });

    it('keeps .mcp.json out of git, as the per-machine file it is, once', async () => {
      await otea('connect', '--as', 'claude');
      await otea('connect', '--as', 'claude-b');

      const status = execFileSync('git', ['status', '--porcelain'], {
        cwd: repo.dir,
        encoding: 'utf8',
      });
      expect(status).not.toContain('.mcp.json');
      const lines = read('.git/info/exclude').split(/\r?\n/);
      expect(lines.filter((line) => line === '/.mcp.json')).toHaveLength(1);
    });

    it('says so when .mcp.json is tracked, and leaves git alone', async () => {
      repo.write('.mcp.json', JSON.stringify({ mcpServers: {} }));
      execFileSync('git', ['add', '.mcp.json'], { cwd: repo.dir });

      const { out } = await otea('connect', '--as', 'claude');

      expect(out).toContain(
        "(.mcp.json is tracked by git: it now names this machine's path to Otea, so keep that change out of your commits)",
      );
      expect(read('.git/info/exclude')).not.toContain('/.mcp.json');
    });

    it('prints the config it wrote with --json', async () => {
      expect(await json('connect', '--as', 'claude')).toEqual({
        path: join(repo.dir, '.mcp.json'),
        server: 'otea',
        agent: 'claude',
        ...entry('claude'),
        git: 'excluded',
      });
    });

    it('keeps the other servers and replaces its own entry', async () => {
      repo.write('.mcp.json', JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
      await otea('connect', '--as', 'claude');
      await otea('connect', '--as', 'claude-b');

      expect(JSON.parse(read('.mcp.json'))).toEqual({
        mcpServers: { other: { command: 'x' }, otea: entry('claude-b') },
      });
    });

    it('asks for the name when none is given and it can ask', async () => {
      const questions: string[] = [];
      const ask = async (question: string) => {
        questions.push(question);
        return ' codex \n';
      };
      const asking = cliAt(repo.dir, {}, undefined, undefined, ask);

      expect((await asking('connect')).code).toBe(0);
      expect(questions).toEqual(['Agent name (short, like claude-b): ']);
      expect(JSON.parse(read('.mcp.json')).mcpServers.otea).toEqual(entry('codex'));
    });

    it('requires --as when it cannot ask', async () => {
      const { code, err } = await otea('connect');

      expect(code).toBe(2);
      expect(err).toContain('Name the agent with --as <name>');
      expect(existsSync(join(repo.dir, '.mcp.json'))).toBe(false);
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
      '',
    ])('refuses %j with invalid_agent_name', async (name) => {
      const { code, err } = await otea('connect', `--as=${name}`, '--json');

      expect(code).toBe(6);
      expect(JSON.parse(err).error.code).toBe('invalid_agent_name');
      expect(existsSync(join(repo.dir, '.mcp.json'))).toBe(false);
    });

    it('fails with not_found before init', async () => {
      const bare = tempGitRepo();
      try {
        expect((await cliAt(bare.dir)('connect', '--as', 'claude')).code).toBe(3);
      } finally {
        bare.remove();
      }
    });
  });
});
