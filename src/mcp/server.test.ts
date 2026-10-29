import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COMMANDS } from '../cli/commands.ts';
import { type Cli, cliAt, tempGitRepo } from '../cli/testing.ts';
import type { Actor } from '../core/item.ts';
import { AGENT_COMMANDS, CLI_ONLY_COMMANDS, createMcpServer, OMITTED_OPTIONS } from './server.ts';

type Reply = { isError?: boolean; content: { type: string; text: string }[] };

async function connect(cwd: string, name: string): Promise<Client> {
  const actor: Actor = { kind: 'agent', name };
  const server = createMcpServer(COMMANDS, { cwd, actor, warn: () => {} });
  const client = new Client({ name: 'test', version: '0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  await client.connect(clientSide);
  return client;
}

describe('mcp server', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  let client: Client;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  const cliError = async (...argv: string[]) => (await otea(...argv, '--json')).err.trim();

  const call = async (name: string, args: Record<string, unknown> = {}, as = client) =>
    (await as.callTool({ name, arguments: args })) as Reply;
  const data = async (name: string, args: Record<string, unknown> = {}) => {
    const reply = await call(name, args);
    expect(reply.isError, reply.content[0]?.text).toBeFalsy();
    return JSON.parse(reply.content[0]?.text ?? '');
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    await otea('collection', 'add', 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'Docs', '--description', 'For v1');
    await otea('create', '--collection', 'tasks', '--title', 'Vague');
    client = await connect(repo.dir, 'claude');
  });

  afterEach(async () => {
    await client.close();
    repo.remove();
  });

  describe('tools', () => {
    it('serves one tool per agent command and keeps every other command CLI-only', async () => {
      const { tools } = await client.listTools();
      const names = COMMANDS.map(({ name }) => name);

      expect(tools.map(({ name }) => name).sort()).toEqual([...AGENT_COMMANDS].sort());
      expect([...AGENT_COMMANDS, ...CLI_ONLY_COMMANDS].sort()).toEqual([...names].sort());
    });

    it('takes the arguments and options of its command', async () => {
      const { tools } = await client.listTools();

      for (const tool of tools) {
        const command = COMMANDS.find(({ name }) => name === tool.name);
        const omitted = OMITTED_OPTIONS[tool.name] ?? [];
        const expected = [
          ...(command?.args ?? []),
          ...Object.keys(command?.options ?? {}).filter((name) => !omitted.includes(name)),
        ];
        expect(Object.keys(tool.inputSchema.properties ?? {}).sort(), tool.name).toEqual(
          expected.sort(),
        );
      }
    });

    it('marks the tools that only read as read-only', async () => {
      const { tools } = await client.listTools();
      const readOnly = tools.filter(({ annotations }) => annotations?.readOnlyHint);

      expect(readOnly.map(({ name }) => name).sort()).toEqual(['events', 'list', 'show', 'wait']);
    });
  });

  describe('reads', () => {
    it('lists items as otea list --json does, with the same filters', async () => {
      expect(await data('list')).toEqual(await json('list'));
      expect(await data('list', { turn: 'agent', unclaimed: true, collection: 'tasks' })).toEqual(
        await json('list', '--turn', 'agent', '--unclaimed', '--collection', 'tasks'),
      );
    });

    it('shows an item as otea show --json does, relayable moves included', async () => {
      const shown = await data('show', { id: 'TASKS-2' });

      expect(shown).toEqual(await json('show', 'TASKS-2'));
      expect(shown.relayable).toEqual([
        { to: 'discarded', by: 'human', reasonRequired: true, turn: 'none' },
      ]);
    });

    it('returns the events after a cursor as an array of otea events --json lines', async () => {
      const lines = (await otea('events', '--since', '1', '--limit', '1', '--json')).out;

      expect(await data('events', { since: '1', limit: '1' })).toEqual([JSON.parse(lines)]);
      expect(await data('events', { item: 'TASKS-1' })).toHaveLength(1);
    });
  });

  describe('writes', () => {
    it('creates and updates items as the agent', async () => {
      const created = await data('create', {
        collection: 'tasks',
        title: 'Footer',
        description: 'Wrong year',
        field: ['priority=high'],
      });
      const updated = await data('update', { id: created.id, title: 'Fix the footer' });

      expect(created).toMatchObject({
        id: 'TASKS-3',
        state: 'todo',
        createdBy: { name: 'claude' },
      });
      expect(updated).toMatchObject({ title: 'Fix the footer', fields: { priority: 'high' } });
    });

    it('claims, renews, moves and releases with the agent as the lease holder', async () => {
      expect(await data('claim', { id: 'TASKS-1', ttl: '30m' })).toMatchObject({
        lease: { holder: 'claude' },
      });
      expect((await data('heartbeat', { id: 'TASKS-1' })).lease.holder).toBe('claude');
      expect((await data('release', { id: 'TASKS-1' })).lease).toBeNull();
      await data('move', { id: 'TASKS-1', state: 'in_progress' });

      expect(await data('move', { id: 'TASKS-1', state: 'review' })).toMatchObject({
        state: 'review',
        turn: 'human',
      });
    });

    it('relays a human decision with the quote', async () => {
      const quote = 'Drop it, it is too vague';
      await data('relay', { id: 'TASKS-2', state: 'discarded', quote, reason: 'Vague' });

      expect((await json('show', 'TASKS-2')).events.at(-1)).toMatchObject({
        actor: { kind: 'human', name: 'human' },
        data: { to: 'discarded', quote, via: 'claude', source: 'conversation' },
      });
    });
  });

  describe('errors', () => {
    const errorOf = async (name: string, args: Record<string, unknown>, as = client) => {
      const reply = await call(name, args, as);
      expect(reply.isError).toBe(true);
      return reply.content[0]?.text ?? '';
    };

    it('replies with the error otea prints under --json', async () => {
      expect(await errorOf('show', { id: 'TASKS-9' })).toBe(await cliError('show', 'TASKS-9'));
      expect(await errorOf('events', { since: 'soon' })).toBe(
        await cliError('events', '--since', 'soon'),
      );
    });

    it('refuses a human-ui move with forbidden, as the CLI does', async () => {
      await otea('move', 'TASKS-1', 'in_progress');
      await otea('move', 'TASKS-1', 'review');

      const text = await errorOf('move', { id: 'TASKS-1', state: 'done' });

      expect(JSON.parse(text).error.code).toBe('forbidden');
      expect(text).toBe(await cliError('move', 'TASKS-1', 'done'));
      expect(
        JSON.parse(await errorOf('relay', { id: 'TASKS-1', state: 'done', quote: 'Yes' })),
      ).toMatchObject({ error: { code: 'forbidden' } });
    });

    it('refuses a write on an item another agent holds with lease_held', async () => {
      const other = await connect(repo.dir, 'codex');
      await data('claim', { id: 'TASKS-1' });

      const text = await errorOf('move', { id: 'TASKS-1', state: 'in_progress' }, other);

      expect(JSON.parse(text).error.code).toBe('lease_held');
      await other.close();
    });
  });

  describe('wait', () => {
    it('returns at once the item already on the turn', async () => {
      expect(await data('wait', { turn: 'agent', unclaimed: true })).toEqual(
        await json('wait', '--turn', 'agent', '--unclaimed'),
      );
    });

    it('gives up with the timeout error when nothing reaches the turn', async () => {
      const reply = await call('wait', { turn: 'human', timeout: '1s' });

      expect(reply.isError).toBe(true);
      expect(JSON.parse(reply.content[0]?.text ?? '')).toEqual({
        error: { code: 'timeout', message: 'No item reached the human turn within 1s' },
      });
    });

    it('refuses a timeout longer than a client keeps a tool call open', async () => {
      const reply = await call('wait', { turn: 'human', timeout: '1h' });

      expect(JSON.parse(reply.content[0]?.text ?? '')).toEqual({
        error: { code: 'usage', message: '--timeout must be at most 15m over MCP' },
      });
    });
  });
});
