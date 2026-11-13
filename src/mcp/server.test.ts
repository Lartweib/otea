import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBoardRecord, publishBoard, saveDraft } from '../app/boards.ts';
import { liveBoardOf } from '../app/next.ts';
import { listAgents } from '../app/presence.ts';
import { openProject } from '../app/project.ts';
import { COMMANDS } from '../cli/commands.ts';
import { type Cli, cliAt, presetCollection, tempGitRepo } from '../cli/testing.ts';
import type { Actor } from '../core/item.ts';
import {
  AGENT_COMMANDS,
  CLI_ONLY_COMMANDS,
  createMcpServer,
  OMITTED_OPTIONS,
  toolName,
} from './server.ts';

type Reply = { isError?: boolean; content: { type: string; text: string }[] };

// `name`: the agent the server was started as (otea mcp --as), or none.
async function connect(cwd: string, name?: string): Promise<Client> {
  const agent = name === undefined ? {} : { agent: name };
  const server = createMcpServer(COMMANDS, { cwd, ...agent, warn: () => {} });
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
    await otea('init', '--local');
    presetCollection(repo.dir, 'tasks');
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

      expect(tools.map(({ name }) => name).sort()).toEqual(AGENT_COMMANDS.map(toolName).sort());
      expect([...AGENT_COMMANDS, ...CLI_ONLY_COMMANDS].sort()).toEqual([...names].sort());
    });

    it('takes the arguments and options of its command', async () => {
      const { tools } = await client.listTools();

      for (const tool of tools) {
        const command = COMMANDS.find(({ name }) => toolName(name) === tool.name);
        const omitted = OMITTED_OPTIONS[tool.name] ?? [];
        const expected = [
          'as',
          ...(command?.args ?? []).map((arg) => arg.replace(/\?$/, '')),
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

      expect(readOnly.map(({ name }) => name).sort()).toEqual([
        'board',
        'events',
        'list',
        'show',
        'wait',
      ]);
    });
  });

  describe('reads', () => {
    it('serves a board and the index as otea board --json does', async () => {
      expect(await data('board')).toEqual(await json('board'));
      expect(await data('board', { name: 'tasks' })).toEqual(await json('board', 'tasks'));
    });

    it('fails with not_found for an unknown collection, as the CLI does', async () => {
      const reply = await call('board', { name: 'nope' });

      expect(reply.isError).toBe(true);
      expect(reply.content[0]?.text).toBe(await cliError('board', 'nope'));
    });

    it('answers next as otea next --json does', async () => {
      const next = await data('next');

      expect(next).toEqual(await json('next'));
      expect(next).toMatchObject({ item: 'TASKS-1', collection: 'tasks' });
      expect(next.text).toContain('Your turn: do this step.');
    });

    it('reads a board published while it runs on its next call, without a restart', async () => {
      expect((await data('next')).text).toContain('Hacerlo, round 1');
      const project = openProject(repo.dir);
      try {
        const id = liveBoardOf(project, 'tasks')?.id ?? '';
        const live = getBoardRecord(project, id).live;
        if (!live) throw new Error('not live');
        const steps = live.definition.steps.map((step) =>
          step.id === 'todo' ? { ...step, name: 'Escribirlo' } : step,
        );
        saveDraft(project, id, {
          definition: { ...live.definition, steps },
          baseVersion: live.version,
        });
        publishBoard(project, id, { moves: {}, by: { kind: 'human', name: 'fede' } });
      } finally {
        project.db.close();
      }

      expect((await data('next')).text).toContain('Escribirlo, round 1');
    });

    it('lists items as otea list --json does, with the same filters', async () => {
      expect(await data('list')).toEqual(await json('list'));
      expect(await data('list', { turn: 'agent', unclaimed: true, collection: 'tasks' })).toEqual(
        await json('list', '--turn', 'agent', '--unclaimed', '--collection', 'tasks'),
      );
      expect(await data('list', { field: ['priority=medium', 'title=Write docs'] })).toEqual(
        await json('list', '--field', 'priority=medium', '--field', 'title=Write docs'),
      );
    });

    it('shows an item as otea show --json does, relayable moves included', async () => {
      const shown = await data('show', { id: 'TASKS-2' });

      expect(shown).toEqual(await json('show', 'TASKS-2'));
      expect(shown.hint).toContain(
        'TASKS-2 · Tarea · Completar, round 1\nYour turn: do this step.',
      );
      expect(shown.relayable).toEqual([
        { to: 'dropped', by: 'human', reasonRequired: true, turn: 'none', closes: 'discarded' },
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
      expect(await data('move', { id: 'TASKS-1', state: 'todo__review' })).toMatchObject({
        state: 'todo__review',
        turn: 'human',
      });
    });

    it('hands off, approves and sends back with the words of the CLI', async () => {
      const handed = await data('handoff', { id: 'TASKS-1' });

      expect(handed).toMatchObject({
        item: { state: 'todo__review' },
        text: 'Handed off. TASKS-1 waits for the person to review Hacerlo.',
      });
      const refused = await call('approve', { id: 'TASKS-1' });
      expect(refused.isError).toBe(true);
      expect(JSON.parse(refused.content[0]?.text ?? '').error.code).toBe('forbidden');
      const back = await call('send_back', { id: 'TASKS-1', reason: 'More' });
      expect(JSON.parse(back.content[0]?.text ?? '').error.code).toBe('forbidden');
    });

    it('attaches evidence read from a path resolved as the CLI resolves it', async () => {
      repo.write('shots/after.png', 'png-after');
      const cli = await json('attach', 'TASKS-1', 'shots/after.png', '--role', 'after');

      const attached = await data('attach', {
        id: 'TASKS-1',
        file: 'shots/after.png',
        role: 'after',
        caption: 'Saved',
      });

      const { id: _cliId, channel: _cliChannel, caption: _none, createdAt: _t1, ...same } = cli;
      expect(attached).toMatchObject({ ...same, id: 2, caption: 'Saved', channel: 'mcp' });
      expect((await data('show', { id: 'TASKS-1' })).evidence).toEqual([cli, attached]);
      expect((await json('show', 'TASKS-1')).events.at(-1)).toMatchObject({
        type: 'evidence_added',
        data: { evidenceId: 2, role: 'after', caption: 'Saved', channel: 'mcp' },
      });
    });

    it('relays a human decision with the quote', async () => {
      const quote = 'Drop it, it is too vague';
      await data('relay', { id: 'TASKS-2', state: 'dropped', quote, reason: 'Vague' });

      expect((await json('show', 'TASKS-2')).events.at(-1)).toMatchObject({
        actor: { kind: 'human', name: 'human' },
        data: { to: 'dropped', quote, via: 'claude', source: 'conversation' },
      });
    });
  });

  describe('provenance', () => {
    it('records the writes made through the tools as made via mcp', async () => {
      const { id } = await data('create', {
        collection: 'tasks',
        title: 'Footer',
        description: 'D',
      });
      await data('handoff', { id });
      await data('relay', { id: 'TASKS-2', state: 'dropped', quote: 'Drop it', reason: 'Vague' });

      const channels = async (item: string) =>
        (await json('show', item)).events.map(
          ({ data }: { data: { channel?: string } }) => data.channel,
        );
      expect(await channels(id)).toEqual(['mcp', 'mcp']);
      expect(await channels('TASKS-2')).toEqual(['cli', 'mcp']);
      expect((await otea('show', id)).out).toContain('created by agent:claude via mcp at ');
    });

    it('links and unlinks items as the agent via mcp, with the errors of the CLI', async () => {
      const relation = await data('link', { id: 'TASKS-2', kind: 'parent', other: 'TASKS-1' });
      const { id } = await data('create', {
        collection: 'tasks',
        title: 'Part',
        parent: 'TASKS-1',
      });

      expect(relation).toMatchObject({ from: 'TASKS-2', to: 'TASKS-1', channel: 'mcp' });
      expect(
        (await data('list', { parent: 'TASKS-1' })).map((item: { id: string }) => item.id),
      ).toEqual(['TASKS-2', id]);
      expect(await data('unlink', { id: 'TASKS-2', kind: 'parent', other: 'TASKS-1' })).toEqual({
        kind: 'parent',
        from: 'TASKS-2',
        to: 'TASKS-1',
      });
      const reply = await call('link', { id: 'TASKS-1', kind: 'parent', other: 'TASKS-1' });
      expect(reply.content[0]?.text).toBe(await cliError('link', 'TASKS-1', 'parent', 'TASKS-1'));
    });

    it('refuses a parent in another collection, with the error of the CLI', async () => {
      presetCollection(repo.dir, 'bugs');
      await otea('create', '--collection', 'bugs', '--title', 'Clips', '--description', 'D');

      const reply = await call('link', { id: 'BUGS-1', kind: 'parent', other: 'TASKS-1' });

      expect(reply.isError).toBe(true);
      expect(reply.content[0]?.text).toContain('parent_across_boards');
      expect(reply.content[0]?.text).toBe(await cliError('link', 'BUGS-1', 'parent', 'TASKS-1'));
    });

    it('names the mcp channel when it refuses a move', async () => {
      await otea('handoff', 'TASKS-1');

      const reply = await call('move', { id: 'TASKS-1', state: 'done' });

      // On a board, the step engine refuses it first, in the board's words.
      expect(reply.content[0]?.text).toContain(
        'Not your turn: the person reviews Hacerlo on TASKS-1',
      );
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
      expect(await errorOf('attach', { id: 'TASKS-1', file: 'nope.png' })).toBe(
        await cliError('attach', 'TASKS-1', 'nope.png'),
      );
    });

    it('refuses a human-ui move with forbidden, as the CLI does', async () => {
      await otea('handoff', 'TASKS-1');

      const text = await errorOf('move', { id: 'TASKS-1', state: 'done' });

      const cli = JSON.parse(await cliError('move', 'TASKS-1', 'done'));
      expect(JSON.parse(text)).toEqual({
        error: { code: 'forbidden', message: cli.error.message.replace('via cli', 'via mcp') },
      });
      expect(
        JSON.parse(await errorOf('relay', { id: 'TASKS-1', state: 'done', quote: 'Yes' })),
      ).toMatchObject({ error: { code: 'forbidden' } });
    });

    it('refuses to relay a decision on the agent’s own step, as the CLI does', async () => {
      await data('handoff', { id: 'TASKS-1' });
      const relayed = { id: 'TASKS-1', state: 'todo', quote: 'dale', reason: 'Redo' };

      const text = await errorOf('relay', relayed);

      expect(JSON.parse(text)).toEqual(
        JSON.parse(await cliError('relay', 'TASKS-1', 'todo', '--quote', 'dale', '--reason', 'R')),
      );
      expect(JSON.parse(text).error.code).toBe('forbidden');
      expect((await json('show', 'TASKS-1')).state).toBe('todo__review');
    });

    it('refuses a write on an item another agent holds with lease_held', async () => {
      const other = await connect(repo.dir, 'codex');
      await data('claim', { id: 'TASKS-1' });

      const text = await errorOf('move', { id: 'TASKS-1', state: 'todo__review' }, other);

      expect(JSON.parse(text).error.code).toBe('lease_held');
      await other.close();
    });

    it('refuses a heartbeat on a lease another agent holds with not_lease_holder', async () => {
      const other = await connect(repo.dir, 'codex');
      await data('claim', { id: 'TASKS-1' });

      const text = await errorOf('heartbeat', { id: 'TASKS-1' }, other);

      expect(JSON.parse(text).error).toMatchObject({
        code: 'not_lease_holder',
        message: expect.stringMatching(/, not by codex: only claude can renew or release it$/),
      });
      await other.close();
    });
  });

  // Subagents share their parent's server, so each call can say who makes it.
  describe('identity', () => {
    const error = (reply: Reply) => JSON.parse(reply.content[0]?.text ?? '').error;

    it('acts as the agent a call names with as, over the name the server was started with', async () => {
      const claimed = await data('claim', { id: 'TASKS-1', as: 'claude-b' });

      expect(claimed.lease.holder).toBe('claude-b');
    });

    it('keeps two subagents on one server apart: one cannot take what the other holds', async () => {
      await data('claim', { id: 'TASKS-1', as: 'scout' });
      const reply = await call('claim', { id: 'TASKS-1', as: 'fixer' });

      expect(reply.isError).toBe(true);
      expect(error(reply).code).toBe('lease_held');
    });

    it('refuses a call that names nobody on a server started without a name', async () => {
      const bare = await connect(repo.dir);
      try {
        const reply = await call('claim', { id: 'TASKS-1' }, bare);

        expect(reply.isError).toBe(true);
        expect(error(reply).code).toBe('unnamed_agent');
        expect(error(reply).message).toContain('as');
        expect((await call('claim', { id: 'TASKS-1', as: 'scout' }, bare)).isError).toBeFalsy();
      } finally {
        await bare.close();
      }
    });

    it('refuses an invalid name in as, as the CLI does', async () => {
      const reply = await call('claim', { id: 'TASKS-1', as: 'Scout' });

      expect(error(reply).code).toBe('invalid_agent_name');
      expect(error(reply)).toEqual(
        JSON.parse(await cliError('claim', 'TASKS-1', '--as', 'Scout')).error,
      );
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

  describe('presence', () => {
    const agents = () => {
      const project = openProject(repo.dir);
      try {
        return listAgents(project.db);
      } finally {
        project.db.close();
      }
    };

    it('hands over the clientInfo of initialize once the client has introduced itself', async () => {
      const greeted: unknown[] = [];
      const server = createMcpServer(COMMANDS, {
        cwd: repo.dir,
        agent: 'codex',
        warn: () => {},
        greeted: (harness) => greeted.push(harness),
      });
      const other = new Client({ name: 'codex-cli', version: '0.9.1' });
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      await server.connect(serverSide);
      await other.connect(clientSide);
      await other.listTools();

      expect(greeted).toEqual([{ name: 'codex-cli', version: '0.9.1' }]);
      await other.close();
    });

    it('records the client as the harness of the agent on each tool call', async () => {
      expect(agents()).toEqual([expect.objectContaining({ name: 'claude', harness: 'cli' })]);

      await data('list');

      expect(agents()).toEqual([
        {
          name: 'claude',
          harness: 'test',
          holding: [],
          lastSeen: expect.any(String),
          live: true,
        },
      ]);
    });

    it('lists what the agent holds once it claims', async () => {
      await data('claim', { id: 'TASKS-1' });

      expect(agents()[0]?.holding).toEqual(['TASKS-1']);
    });
  });
});
