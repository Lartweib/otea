import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { waitingDraftOf } from '../app/agent-draft.ts';
import { listBoardSummaries } from '../app/boards.ts';
import { listItems } from '../app/items.ts';
import { openProject } from '../app/project.ts';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// An agent the person asked for a board starts the same flow Studio's "Que lo esboce un agente"
// does: otea board draft --new makes the waiting board and its Pedido, held by the agent; the
// person publishes it in Studio.
describe('otea board draft --new', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const read = <T>(use: (project: ReturnType<typeof openProject>) => T): T => {
    const project = openProject(repo.dir);
    try {
      return use(project);
    } finally {
      project.db.close();
    }
  };
  const errorOf = async (cli: Cli, ...argv: string[]) => {
    const result = await cli(...argv, '--json');
    return { code: result.code, error: JSON.parse(result.err).error };
  };
  const boards = () => read((project) => listBoardSummaries(project).map(({ name }) => name));

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local', '--template', 'none');
  });

  afterEach(() => repo.remove());

  it('makes the waiting board and its Pedido, held by the agent, with what it is for', async () => {
    const { code, out } = await otea(
      'board',
      'draft',
      '--new',
      'Criaturas',
      '--why',
      'Criaturas del pantano, con arte y animación',
    );

    expect(code).toBe(0);
    const { item, board, lease, fields } = read((project) => {
      const [pedido] = listItems(project, { collection: 'Pedidos' });
      const id = pedido?.id ?? '';
      return {
        item: id,
        board: waitingDraftOf(project, id),
        lease: pedido?.lease?.holder,
        fields: Object.values(pedido?.fields ?? {}),
      };
    });
    expect(item).not.toBe('');
    expect(board?.draft?.definition.name).toBe('Criaturas');
    expect(lease).toBe('claude');
    expect(fields.join(' ')).toContain('Criaturas del pantano, con arte y animación');
    expect(out).toContain(item);
    expect(out).toContain('waits in Studio for the person to try and publish');
    expect(out).toContain(`/#/studio/board/${board?.id}`);
    expect(out).toContain(`otea board draft ${item} > board.json`);
  });

  it('answers the board and the Pedido with --json, and the draft to start from after', async () => {
    const made = JSON.parse(
      (await otea('board', 'draft', '--new', 'Criaturas', '--why', 'Del pantano', '--json')).out,
    );

    expect(made.item).toMatch(/^[A-Z]+-1$/);
    expect(made.board.draft.requestItem).toBe(made.item);
    expect(made.studio).toContain(`/#/studio/board/${made.board.id}`);
    const draft = JSON.parse((await otea('board', 'draft', made.item)).out);
    expect(draft.name).toBe('Criaturas');
  });

  it('hands a board.json in at once with --file, saying what is still to fix', async () => {
    const start = JSON.parse(
      (await otea('board', 'draft', '--new', 'Borrador', '--why', 'Para probar', '--json')).out,
    );
    const definition = JSON.parse((await otea('board', 'draft', start.item)).out);
    const file = join(repo.dir, 'board.json');
    writeFileSync(file, JSON.stringify({ ...definition, name: 'Criaturas' }));

    const { code, out } = await otea(
      'board',
      'draft',
      '--new',
      'Criaturas',
      '--why',
      'Del pantano',
      '--file',
      'board.json',
    );

    expect(code).toBe(0);
    expect(out).toMatch(/Handed in the board draft on [A-Z]+-2 \(evidence \d+\)/);
    expect(out).toContain('waits in Studio for the person to try and publish');
    const arrived = read((project) =>
      listBoardSummaries(project).find(({ name }) => name === 'Criaturas'),
    );
    expect(arrived?.status).not.toBe('waiting');
  });

  it('makes nothing when the file is not a board, saying what is wrong', async () => {
    writeFileSync(join(repo.dir, 'board.json'), JSON.stringify({ name: 'Criaturas', steps: 3 }));

    const { code, error } = await errorOf(
      otea,
      'board',
      'draft',
      '--new',
      'Criaturas',
      '--why',
      'Del pantano',
      '--file',
      'board.json',
    );

    expect(code).toBe(9);
    expect(error.code).toBe('invalid_board');
    expect(error.message).toContain('The file is not a board:');
    expect(error.message).toContain('Nothing was made');
    expect(boards()).not.toContain('Criaturas');
  });

  it('refuses a name another board or draft has, making no Pedido', async () => {
    await otea('board', 'draft', '--new', 'Criaturas', '--why', 'Del pantano');

    const { code, error } = await errorOf(
      otea,
      'board',
      'draft',
      '--new',
      'criaturas',
      '--why',
      'Otra vez',
    );

    expect(code).not.toBe(0);
    expect(error.code).toBe('already_exists');
    const pedidos = read((project) => listItems(project, { collection: 'Pedidos' }));
    expect(pedidos).toHaveLength(1);
  });

  it('asks what the board is for', async () => {
    const { error } = await errorOf(otea, 'board', 'draft', '--new', 'Criaturas');

    expect(error.code).toBe('missing_fields');
    expect(error.message).toContain('--why');
    expect(boards()).not.toContain('Criaturas');
  });

  it('refuses an unnamed agent', async () => {
    const { code, error } = await errorOf(
      cliAt(repo.dir),
      'board',
      'draft',
      '--new',
      'Criaturas',
      '--why',
      'Del pantano',
    );

    expect(code).toBe(2);
    expect(error.code).toBe('unnamed_agent');
    expect(boards()).not.toContain('Criaturas');
  });

  it('takes either a Pedido or --new, not both and not neither', async () => {
    expect((await otea('board', 'draft')).code).toBe(2);
    expect((await otea('board', 'draft', 'PED-1', '--new', 'Criaturas', '--why', 'x')).code).toBe(
      2,
    );
  });

  it('is how otea board and its help say to propose a board', async () => {
    const propose = 'otea board draft --new "<name>" --why "<what it is for>"';

    expect((await otea('board', '--help')).out).toContain(propose);
    expect((await otea('board')).out).toContain(`To propose a new board, run ${propose}`);
  });

  it('is the board_draft tool over MCP, as the agent named', async () => {
    const server = createMcpServer(COMMANDS, { cwd: repo.dir, warn: () => {} });
    const client = new Client({ name: 'test', version: '0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);
    try {
      const reply = (await client.callTool({
        name: 'board_draft',
        arguments: { as: 'kiln', new: 'Criaturas', why: 'Del pantano' },
      })) as { isError?: boolean; content: { text: string }[] };

      expect(reply.isError, reply.content[0]?.text).toBeFalsy();
      const made = JSON.parse(reply.content[0]?.text ?? '');
      const lease = read((project) => listItems(project, { collection: 'Pedidos' })[0]?.lease);
      expect(lease?.holder).toBe('kiln');
      expect(made.item).toMatch(/-1$/);
    } finally {
      await client.close();
    }
  });
});
