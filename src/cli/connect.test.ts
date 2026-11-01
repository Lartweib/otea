import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

const BLOCK = [
  '<!-- otea:begin -->',
  '## Otea',
  '',
  'This project hands work between humans and agents through Otea. Before you pick up an item, run `otea playbook` (or call the `playbook` tool of the Otea MCP server) and follow the playbook of the collection you work in. `otea show <id>` says what to do next with each item.',
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
      await otea('init');

      expect(existsSync(join(repo.dir, 'AGENTS.md'))).toBe(false);
    });

    it('creates AGENTS.md with the Otea block', async () => {
      const { code, out } = await otea('init', '--agents-md');

      expect(code).toBe(0);
      expect(read('AGENTS.md')).toBe(`${BLOCK}\n`);
      expect(out).toBe(
        `${join(repo.dir, '.otea')}\nAdded the Otea block to ${join(repo.dir, 'AGENTS.md')}\n`,
      );
    });

    it('appends the block to an existing AGENTS.md and keeps what it says', async () => {
      repo.write('AGENTS.md', '# Agents\n\nRun the tests.\n');

      expect((await json('init', '--agents-md')).agentsMd).toEqual({
        path: join(repo.dir, 'AGENTS.md'),
        action: 'added',
      });
      expect(read('AGENTS.md')).toBe(`# Agents\n\nRun the tests.\n\n${BLOCK}\n`);
    });

    it('is idempotent: running it again changes nothing', async () => {
      repo.write('AGENTS.md', '# Agents\n');
      await otea('init', '--agents-md');
      const once = read('AGENTS.md');

      expect((await json('init', '--agents-md')).agentsMd.action).toBe('unchanged');
      expect(read('AGENTS.md')).toBe(once);
    });

    it('replaces an outdated block in place instead of adding a second one', async () => {
      repo.write(
        'AGENTS.md',
        '# Agents\n\n<!-- otea:begin -->\nold words\n<!-- otea:end -->\n\n## Style\n',
      );

      expect((await json('init', '--agents-md')).agentsMd.action).toBe('updated');
      expect(read('AGENTS.md')).toBe(`# Agents\n\n${BLOCK}\n\n## Style\n`);
    });
  });

  describe('connect', () => {
    beforeEach(async () => {
      await otea('init');
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
        `Connected "claude-b": ${join(repo.dir, '.mcp.json')} serves otea mcp --as claude-b\n`,
      );
    });

    it('prints the config it wrote with --json', async () => {
      expect(await json('connect', '--as', 'claude')).toEqual({
        path: join(repo.dir, '.mcp.json'),
        server: 'otea',
        agent: 'claude',
        ...entry('claude'),
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
