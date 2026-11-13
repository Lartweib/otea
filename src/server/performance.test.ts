import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createItem } from '../app/items.ts';
import { handoffItem } from '../app/next.ts';
import type { Project } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { creatures } from '../core/board/testing.ts';
import { saveProfile } from '../store/queries.ts';
import { createServer, type OteaServer } from './server.ts';
import { memoryProject, request } from './testing.ts';

describe('GET /api/performance', () => {
  let project: Project;
  let server: OteaServer;

  beforeEach(() => {
    project = memoryProject();
    const def = creatures();
    for (const step of def.steps) step.hand = [];
    publishAs(project, def, 'bcri');
    const profile = { harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high' };
    const at = new Date().toISOString();
    saveProfile(project.db, 'kiln', profile, { at, channel: 'cli', confirmed: true });
    const actor = { kind: 'human' as const, name: 'fede' };
    const item = createItem(project, {
      collection: 'Criaturas',
      title: 'Rana',
      fields: { fdesc: 'verde' },
      actor,
    });
    handoffItem(project, { id: item.id, actor: { kind: 'agent', name: 'kiln' }, channel: 'cli' });
    server = createServer(project);
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('gives each model family and effort its numbers, for a board and a period', async () => {
    const response = await request(server, '/api/performance?board=Criaturas&since=30d');

    expect(response.status).toBe(200);
    const view = (await response.json()) as { rows: unknown[]; since: string | null };
    expect(view.rows).toEqual([
      expect.objectContaining({ family: 'opus', effort: 'high', handoffs: 1 }),
    ]);
    expect(view.since).not.toBeNull();
  });

  it('refuses a period it cannot read with 400, and a board there is not with 404', async () => {
    expect((await request(server, '/api/performance?since=soon')).status).toBe(400);
    expect((await request(server, '/api/performance?board=Nada')).status).toBe(404);
  });
});
