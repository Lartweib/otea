import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { openProject } from '../app/project.ts';
import { answerQuestion } from '../app/questions.ts';
import { creatures } from '../core/board/testing.ts';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, declareProfiles, type TempRepo, tempGitRepo } from './testing.ts';

// An agent's question to the person: otea ask on the CLI and ask over MCP, what show and next say
// while it waits and once answered, and the wait the answer wakes.
describe('an agent asks the person, on the CLI and over MCP', () => {
  let repo: TempRepo;
  let otea: Cli;

  const answer = (text: string) => {
    const project = openProject(repo.dir);
    try {
      return answerQuestion(project, {
        id: 'CRI-1',
        text,
        actor: { kind: 'human', name: 'human' },
        channel: 'ui',
      });
    } finally {
      project.db.close();
    }
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    declareProfiles(repo.dir, 'claude');
    const project = openProject(repo.dir);
    try {
      const record = createBoard(project, { name: 'Criaturas', lang: 'es' });
      saveDraft(project, record.id, { definition: creatures(), baseVersion: null });
      publishBoard(project, record.id, { moves: {}, by: { kind: 'human', name: 'fede' } });
    } finally {
      project.db.close();
    }
    await otea(
      'create',
      '--collection',
      'Criaturas',
      '--title',
      'Tortuga',
      '--field',
      'fdesc=Lenta',
    );
    await otea('claim', 'CRI-1');
  });

  afterEach(() => repo.remove());

  it('asks, hands the turn to the person, and gives the answer back in the same round', async () => {
    const asked = await otea('ask', 'CRI-1', '¿Caparazón liso o con musgo?');
    expect(asked.code).toBe(0);
    expect(asked.out).toContain('Asked the person on CRI-1: the turn is theirs until they answer');

    const shown = JSON.parse((await otea('show', 'CRI-1', '--json')).out);
    expect(shown.turn).toBe('human');
    expect(shown.asks).toMatchObject({ question: 1, by: 'claude' });
    expect((await otea('show', 'CRI-1')).out).toContain(
      'Waiting for the person to answer your question: "¿Caparazón liso o con musgo?"',
    );
    const handed = await otea('handoff', 'CRI-1');
    expect(handed.code).not.toBe(0);
    expect(handed.err).toContain('waits for their answer');

    answer('Con musgo');

    const waited = await otea('wait', '--turn', 'agent', '--timeout', '5s');
    expect(waited.out).toBe('CRI-1: the person answered your question. Read it: otea show CRI-1\n');
    const next = await otea('next');
    expect(next.out).toContain('Concepto, round 1');
    expect(next.out).toContain('You asked the person: "¿Caparazón liso o con musgo?"');
    expect(next.out).toContain('The person answered: "Con musgo"');
  });

  it('refuses a question with no words', async () => {
    const { code, err } = await otea('ask', 'CRI-1', '  ');
    expect(code).toBe(2);
    expect(err).toContain('say your question');
  });

  it('asks over MCP with the ask tool', async () => {
    const server = createMcpServer(COMMANDS, { cwd: repo.dir, agent: 'claude', warn: () => {} });
    const client = new Client({ name: 'test', version: '0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);
    const reply = (await client.callTool({
      name: 'ask',
      arguments: { id: 'CRI-1', question: '¿A o B?' },
    })) as { isError?: boolean; content: { text: string }[] };
    expect(reply.isError).toBe(false);
    const data = JSON.parse(reply.content[0]?.text ?? 'null');
    expect(data.question).toMatchObject({ question: 1, text: '¿A o B?', by: 'claude' });
    expect(data.text).toContain('the turn is theirs');
    await client.close();
  });
});
