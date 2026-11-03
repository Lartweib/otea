import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { cliAt, spawnCli, type TempRepo, tempGitRepo } from './testing.ts';

// Two separate repos that share one project in common storage. The test setup points OTEA_HOME at a
// temporary folder for this file, in this process and in the CLI processes it spawns.
describe('projects', () => {
  let a: TempRepo;
  let b: TempRepo;

  const json = async (repo: TempRepo, ...argv: string[]) => {
    const { code, out, err } = await cliAt(repo.dir, { OTEA_AGENT: 'claude' })(...argv, '--json');
    expect(code, err).toBe(0);
    return JSON.parse(out);
  };

  beforeEach(() => {
    a = tempGitRepo();
    b = tempGitRepo();
  });

  afterEach(() => {
    a.remove();
    b.remove();
  });

  it('init --common keeps the data in the Otea home and nothing in the repo', async () => {
    const init = await json(a, 'init', '--common');

    expect(init).toMatchObject({ root: a.dir, storage: 'common' });
    expect(init.path).toBe(join(process.env.OTEA_HOME ?? '', 'data', init.id));
    expect(existsSync(join(a.dir, '.otea'))).toBe(false);
  });

  it('init --join links a second repo, and items created in one are listed in the other', async () => {
    const { id } = await json(a, 'init', '--common');

    const joined = await json(b, 'init', '--join', id);
    await json(a, 'collection', 'add', 'tasks');
    await json(a, 'create', '--collection', 'tasks', '--title', 'From A');

    expect(joined).toMatchObject({ root: b.dir, id, storage: 'common' });
    expect((await json(b, 'list')).map((item: { title: string }) => item.title)).toEqual([
      'From A',
    ]);
    // A separate process finds it too, through the OTEA_HOME it inherits. Starting one is slow.
    const spawned = await spawnCli(b.dir, 'list', '--json');
    expect(JSON.parse(spawned.out).map((item: { id: string }) => item.id)).toEqual(['TASKS-1']);
  }, 30_000);

  it('serves the shared project to an MCP client in the other repo', async () => {
    const { id } = await json(a, 'init', '--common');
    await json(b, 'init', '--join', id);
    await json(a, 'collection', 'add', 'tasks');
    await json(a, 'create', '--collection', 'tasks', '--title', 'From A');
    const actor = { kind: 'agent', name: 'claude' } as const;
    const server = createMcpServer(COMMANDS, { cwd: b.dir, actor, warn: () => {} });
    const client = new Client({ name: 'test', version: '0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);

    const reply = (await client.callTool({ name: 'list', arguments: {} })) as {
      content: { text: string }[];
    };
    await client.close();

    expect(JSON.parse(reply.content[0]?.text ?? '')[0]).toMatchObject({ title: 'From A' });
  });

  it('projects current names the project this folder resolves to', async () => {
    const { id, name, path } = await json(a, 'init', '--common');
    await json(b, 'init');

    expect(await json(a, 'projects', 'current')).toEqual({
      id,
      name,
      storage: 'common',
      root: a.dir,
      dataDir: path,
    });
    expect(await json(b, 'projects', 'current')).toMatchObject({
      storage: 'local',
      dataDir: join(b.dir, '.otea'),
    });
  });

  it('projects add links a folder, and projects list shows every linked folder', async () => {
    const { id } = await json(a, 'init', '--common');

    const linked = await json(a, 'projects', 'add', b.dir, '--to', id);
    const listed = (await json(a, 'projects', 'list')).find(
      (project: { id: string }) => project.id === id,
    );

    expect(linked).toMatchObject({ path: b.dir, projectId: id, kind: 'repo' });
    expect(listed.paths).toHaveLength(2);
    expect(listed.paths).toEqual(
      expect.arrayContaining([
        { path: a.dir, kind: 'repo' },
        { path: b.dir, kind: 'repo' },
      ]),
    );
    expect((await json(b, 'projects', 'current')).id).toBe(id);
  });

  it('refuses --join together with --common', async () => {
    const { code, err } = await cliAt(a.dir)('init', '--join', 'x', '--common');

    expect(code).toBe(2);
    expect(err).toContain('--join');
  });
});
