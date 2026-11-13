import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, presetCollection, type TempRepo, tempGitRepo } from './testing.ts';

// A board stores its steps, fields and choices under hidden ids (todo, priority, high); a program
// reading Otea's output gets their names beside them, so it never has to translate one itself.
describe('names in output', () => {
  let repo: TempRepo;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  const ndjson = async (...argv: string[]) =>
    (await otea(...argv, '--json')).out
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    presetCollection(repo.dir, 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'Write docs', '--description', 'D');
    await otea('update', 'TASKS-1', '--field', 'priority=high');
    await otea('handoff', 'TASKS-1');
  });

  afterEach(() => repo.remove());

  const FIELDS = [
    { id: 'description', name: 'Descripción', value: 'D' },
    { id: 'priority', name: 'Prioridad', value: 'high', label: 'Alta' },
  ];

  it('gives an item its step and its fields by name in --json', async () => {
    const item = await json('show', 'TASKS-1');

    expect(item).toMatchObject({
      state: 'todo__review',
      stateName: 'Hacerlo (in review)',
      fields: FIELDS,
    });
    expect((await json('list'))[0]).toMatchObject({ stateName: 'Hacerlo (in review)' });
    expect((await json('list'))[0].fields).toEqual(FIELDS);
  });

  it('names the steps and fields of the events in show --json', async () => {
    const { events } = await json('show', 'TASKS-1');

    expect(events.map(({ data }: { data: unknown }) => data)).toEqual([
      expect.objectContaining({ state: 'todo', stateName: 'Hacerlo' }),
      expect.objectContaining({
        changes: { priority: { name: 'Prioridad', from: 'medium', to: 'high' } },
      }),
      expect.objectContaining({
        from: 'todo',
        fromName: 'Hacerlo',
        to: 'todo__review',
        toName: 'Hacerlo (in review)',
      }),
    ]);
  });

  it('prints events by step and field names, and names them in --json as show does', async () => {
    const { out } = await otea('events');

    expect(out).toMatch(/ created {2}Hacerlo\n/);
    expect(out).toMatch(/ updated {2}Prioridad: "Media" -> "Alta"\n/);
    expect(out).toMatch(/ transitioned {2}Hacerlo -> Hacerlo \(in review\)\n/);
    expect(await ndjson('events')).toEqual((await json('show', 'TASKS-1')).events);
  });

  it('writes the brief with step and field names', async () => {
    const { out } = await otea('brief', 'TASKS-1');

    expect(out).toContain('- board: tasks · Hacerlo (in review)\n- Prioridad: Alta\n');
  });

  it('answers MCP with the same names as --json', async () => {
    const server = createMcpServer(COMMANDS, {
      cwd: repo.dir,
      agent: 'claude',
      warn: () => {},
    });
    const client = new Client({ name: 'test', version: '0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);
    try {
      const reply = (await client.callTool({ name: 'show', arguments: { id: 'TASKS-1' } })) as {
        content: { text: string }[];
      };
      expect(JSON.parse(reply.content[0]?.text ?? '')).toMatchObject({
        stateName: 'Hacerlo (in review)',
        fields: FIELDS,
      });
    } finally {
      await client.close();
    }
  });
});
