import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initBoards } from '../app/init-boards.ts';
import { createItem } from '../app/items.ts';
import { claimItem } from '../app/leases.ts';
import { liveBoardOf } from '../app/next.ts';
import { hearAgent } from '../app/presence.ts';
import type { Project } from '../app/project.ts';
import { designPrompt, startPrompt } from '../core/agent-prompts.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// GET /api/agent-prompt: what Conectar un agente and the empty project copy, in the screen's
// language, built from the project as it is now.
describe('GET /api/agent-prompt', () => {
  let project: Project;
  let server: OteaServer;

  const get = async (query: string) => {
    const response = await server.app.request(`/p/memory-aaaaaa/api/agent-prompt${query}`, {
      headers: { host: LOCAL_HOST, cookie: SESSION_COOKIE },
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  beforeEach(() => {
    project = memoryProject();
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('gives the first contact while the project has no board of its own', async () => {
    expect(await get('?lang=es')).toEqual({
      status: 200,
      body: { kind: 'start', prompt: startPrompt('es', false) },
    });
    expect((await get('?lang=en')).body.prompt).toBe(startPrompt('en', false));
  });

  it('gives the join prompt once there are boards, naming who listens and what waits', async () => {
    initBoards(project, 'changes');
    const want = liveBoardOf(project, 'Cambios')?.def.form[0]?.ref ?? '';
    createItem(project, {
      collection: 'Cambios',
      title: 'Fix the footer',
      fields: { [want]: 'It shows last year' },
      actor: { kind: 'human', name: 'fede' },
      channel: 'ui',
    });
    hearAgent(project.db, { agent: 'claude', channel: 'mcp', harness: { name: 'claude-code' } });

    const { body } = await get('?lang=es');
    expect(body.kind).toBe('join');
    expect(body.prompt).toContain('(claude)');
    expect(body.prompt).toContain(
      '- Cambios: Aclarar, Hacerlo, Integrar (1 espera a un agente ahora)',
    );
    expect((await get('?kind=design&lang=es')).body).toEqual({
      kind: 'design',
      prompt: designPrompt('es'),
    });
  });

  it('names an agent working under a lease though it is not listening now', async () => {
    initBoards(project, 'changes');
    const want = liveBoardOf(project, 'Cambios')?.def.form[0]?.ref ?? '';
    const item = createItem(project, {
      collection: 'Cambios',
      title: 'Fix the footer',
      fields: { [want]: 'It shows last year' },
      actor: { kind: 'human', name: 'fede' },
      channel: 'ui',
    });
    const long = () => new Date(Date.now() - 60 * 60_000).toISOString();
    hearAgent(project.db, { agent: 'claude-b', channel: 'cli' }, long);
    claimItem(project, { id: item.id, actor: { kind: 'agent', name: 'claude-b' } });

    const { prompt } = (await get('?lang=en')).body;
    expect(prompt).toContain('not one already working here (claude-b)');
    expect(prompt).toContain('such as claude-c)');
  });

  it('tells the first agent of a project with boards to connect, with nobody to join', async () => {
    initBoards(project, 'changes');

    const { body } = await get('?lang=es');
    expect(body).toMatchObject({ kind: 'join', first: true });
    expect(body.prompt).toContain('otea connect --as <nombre>');
    expect(body.prompt).not.toContain('No ejecutes otea connect');

    hearAgent(project.db, { agent: 'claude', channel: 'mcp', harness: { name: 'claude-code' } });
    expect((await get('?lang=es')).body.first).toBeUndefined();
  });

  it('refuses a moment it does not know', async () => {
    expect((await get('?kind=later')).status).toBe(400);
  });
});
