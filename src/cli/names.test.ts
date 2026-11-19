import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, presetCollection, seedOnce, type TempRepo } from './testing.ts';

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

  // Seeded once and copied for each test: seeding through the CLI before every one of them took a
  // loaded Windows runner past the hook's 30s.
  const seeded = seedOnce(async (seed, dir) => {
    presetCollection(dir, 'tasks');
    await seed('create', '--collection', 'tasks', '--title', 'Write docs', '--description', 'D');
    await seed('update', 'TASKS-1', '--field', 'priority=high');
    await seed('handoff', 'TASKS-1');
  });

  beforeEach(() => {
    ({ repo, otea } = seeded.fresh());
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
      stateName: 'Hacerlo (en revisión)',
      fields: FIELDS,
    });
    expect((await json('list'))[0]).toMatchObject({ stateName: 'Hacerlo (en revisión)' });
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
        toName: 'Hacerlo (en revisión)',
      }),
    ]);
  });

  it('prints events by step and field names, and names them in --json as show does', async () => {
    const { out } = await otea('events');

    expect(out).toMatch(/ created {2}Hacerlo\n/);
    expect(out).toMatch(/ updated {2}Prioridad: "Media" -> "Alta"\n/);
    expect(out).toMatch(/ transitioned {2}Hacerlo -> Hacerlo \(en revisión\)\n/);
    expect(await ndjson('events')).toEqual((await json('show', 'TASKS-1')).events);
  });

  it('writes the brief with step and field names', async () => {
    const { out } = await otea('brief', 'TASKS-1');

    expect(out).toContain('- board: tasks · Hacerlo (en revisión)\n- Prioridad: Alta\n');
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
        stateName: 'Hacerlo (en revisión)',
        fields: FIELDS,
      });
    } finally {
      await client.close();
    }
  });

  // Impacto came back as "low" while the desk said «baja» (P2S-R3-6): a level has its label too.
  it('gives a level field its label beside its key, as a choice has', async () => {
    const person = cliAt(repo.dir);
    expect((await person('board', 'add', 'Cambios', '--template', 'changes')).code).toBe(0);
    const made = await json(
      'create',
      '--collection',
      'Cambios',
      '--title',
      'Botón',
      '--field',
      'Qué quiero=x',
      '--field',
      'Impacto=low',
    );
    expect(made.fields).toContainEqual({
      id: expect.any(String),
      name: 'Impacto',
      value: 'low',
      label: 'baja',
    });
  });
});
