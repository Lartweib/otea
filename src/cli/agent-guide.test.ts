import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENTS_BLOCK } from '../app/agents.ts';
import { AGENT_GUIDE } from '../core/agent-guide.ts';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, presetCollection, tempGitRepo } from './testing.ts';

// Otea's agent guide is one text, read in three places: the MCP server's instructions, the
// AGENTS.md block and the start of otea board.
describe("Otea's agent guide", () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local', '--template', 'none');
    presetCollection(repo.dir, 'tasks');
  });

  afterEach(() => repo.remove());

  it('tells agents to follow the board to the letter, each under its own name', () => {
    for (const line of [
      'otea next --claim',
      'claim it again at each new step',
      '"Before you hand it off"',
      'never invent a procedure of your own',
      '"Sent back to you"',
      'the exact command next prints',
      'Never relay a decision on a step you did',
      'nor review it',
      'Never push to a branch',
      'every subagent',
      "never reuse your parent's",
      '--as <name>',
    ]) {
      expect(AGENT_GUIDE).toContain(line);
    }
  });

  it('is the MCP server instructions', async () => {
    const server = createMcpServer(COMMANDS, { cwd: repo.dir, warn: () => {} });
    const client = new Client({ name: 'test', version: '0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);
    expect(client.getInstructions()).toBe(AGENT_GUIDE);
    await client.close();
  });

  it('is in the AGENTS.md block init --agents-md writes', async () => {
    await otea('init', '--local', '--agents-md');
    const written = readFileSync(join(repo.dir, 'AGENTS.md'), 'utf8');
    expect(AGENTS_BLOCK).toContain(AGENT_GUIDE);
    expect(written).toContain(AGENT_GUIDE);
  });

  it('starts otea board, with a name and without', async () => {
    for (const argv of [['board'], ['board', 'tasks']]) {
      const { code, out } = await otea(...argv);
      expect(code).toBe(0);
      expect(out.startsWith(`${AGENT_GUIDE}\n\n`)).toBe(true);
    }
  });

  it('stays out of otea board --json, which scripts read', async () => {
    const { out } = await otea('board', 'tasks', '--json');
    expect(out).not.toContain(AGENT_GUIDE);
  });
});
