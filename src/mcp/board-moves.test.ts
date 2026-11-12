import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createItem, getItem, updateItem } from '../app/items.ts';
import { handoffItem } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { COMMANDS } from '../cli/commands.ts';
import { type Cli, cliAt, tempGitRepo } from '../cli/testing.ts';
import { errores } from '../core/board/testing.ts';
import { createMcpServer } from './server.ts';

type Reply = { isError?: boolean; content: { type: string; text: string }[] };

// The tools an agent uses on a board: handoff with its note and a way back, and drop with a motive.
describe('board moves over MCP', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  let client: Client;
  let id: string;

  const call = async (name: string, args: Record<string, unknown>) => {
    const reply = (await client.callTool({ name, arguments: args })) as Reply;
    return { isError: reply.isError === true, body: JSON.parse(reply.content[0]?.text ?? '') };
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init', '--local');
    const project = openProject(repo.dir);
    try {
      publishAs(project, errores(), 'berr');
      const you = { kind: 'human' as const, name: 'fede' };
      const bug = createItem(project, {
        collection: 'Errores',
        title: 'Faro',
        fields: { fsteps: 'abrir', fcat: 'cgame' },
        actor: you,
        channel: 'ui',
      });
      id = bug.id;
      while (getItem(project, id).state !== 'sfix') {
        updateItem(project, { id, fields: { fcat: 'cgame' }, actor: you });
        handoffItem(project, { id, actor: you, channel: 'ui' });
      }
    } finally {
      project.db.close();
    }
    const server = createMcpServer(COMMANDS, {
      cwd: repo.dir,
      actor: { kind: 'agent', name: 'mender' },
      warn: () => {},
    });
    client = new Client({ name: 'test', version: '0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);
  });

  afterEach(async () => {
    await client.close();
    repo.remove();
  });

  it('takes an item back with handoff { way, reason }, refusing it without a reason', async () => {
    expect(await call('handoff', { id, way: 'Triar' })).toEqual({
      isError: true,
      body: {
        error: { code: 'reason_required', message: 'Not taken back: say why with --reason.' },
      },
    });
    const back = await call('handoff', { id, way: 'Triar', reason: 'no es un bug' });
    expect(back.body.text).toBe(`Taken back. ${id} returns to Triar, round 2.`);
  });

  it('drops with drop { reason, as }, the motive by name', async () => {
    const dropped = await call('drop', { id, reason: 'repetido', as: 'Duplicado' });
    expect(dropped).toMatchObject({
      isError: false,
      body: { text: `Dropped. ${id} is Dropped (Duplicado).` },
    });
  });

  it('asks the note of handoff { note }', async () => {
    const refused = await call('handoff', { id });
    expect(refused.body.error.code).toBe('missing_fields');
    expect(refused.body.error.message).toContain('a note');
  });
});
