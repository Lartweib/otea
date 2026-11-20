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
      'otea ask <id> "<question>"',
      // P3C-R3-8: what the session says, never a config file read outside the project.
      'Declare what this session tells you (your instructions, or what the person says)',
      'never open config files outside the project for it. Otherwise declare unknown.',
      'declare unknown. Never guess.',
      'To propose a new board, run otea board draft --new "<name>" --why "<what it is for>"',
      // P4-6: how otea board says to change a published board.
      'to change a published board (a field, a step), --change <board> instead of --new',
      'the person publishes it',
      'asking the person one question at a time',
      '--template <key>',
      'Keep going until the person stops you',
      'otea wait --turn agent --unclaimed',
      'in a background shell, which keeps your chat free',
      'Every request the person makes, in chat too, goes on a board first: otea create it',
      'A subagent releases what it holds before it ends',
      // P4-R2-2: the person's answer is theirs; one given in the chat goes on the question.
      'an answer they give in the chat goes on it: otea answer <id> "<their words>"',
      // P2S-6, P8-R2-13, P8-R2-11: only a running wait hears the desk, and it is stopped safely.
      'Only a running wait hears the desk',
      'after a chat reply, wait again',
      'Stop your wait by ending its shell or with --timeout, never by killing processes by name',
      // P3C-R3-2: «leave it for later» is release --later, and otea wait is the only way to wait.
      // P7-R3-6: it is the person's wish, so it holds for every agent.
      'When the person says to leave an item for later: otea release <id> --later sets it aside for every agent; then keep waiting.',
      'Never write a polling loop of your own: otea wait is how you wait.',
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

  it('stays out of otea board --json, which scripts read', async () => {
    const { out } = await otea('board', 'tasks', '--json');
    expect(out).not.toContain(AGENT_GUIDE);
  });
});
