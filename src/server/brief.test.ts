import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { linkItems } from '../app/relations.ts';
import type { Actor } from '../core/item.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, memoryProject } from './testing.ts';

const ana: Actor = { kind: 'human', name: 'ana' };

describe('POST /api/brief', () => {
  let project: Project;
  let server: OteaServer;

  const post = (body: unknown) =>
    Promise.resolve(
      server.app.request('/api/brief', {
        method: 'POST',
        headers: { host: LOCAL_HOST, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  beforeEach(() => {
    project = memoryProject();
    addCollection(project, { name: 'tasks' });
    for (const title of ['Write docs', 'Ship it']) {
      createItem(project, { collection: 'tasks', title, fields: { description: 'D' }, actor: ana });
    }
    linkItems(project, {
      id: 'TASKS-1',
      kind: 'blocks',
      other: 'TASKS-2',
      actor: ana,
      channel: 'cli',
    });
    server = createServer(project);
  });

  afterEach(() => {
    server.close();
    project.db.close();
  });

  it('writes the brief in block order, without a session', async () => {
    const response = await post({
      ids: ['TASKS-2', 'TASKS-1'],
      limits: ['Stay in docs/'],
      success: [],
    });

    expect(response.status).toBe(200);
    const brief = (await response.json()) as { order: Array<{ id: string }>; markdown: string };
    expect(brief.order.map(({ id }) => id)).toEqual(['TASKS-1', 'TASKS-2']);
    expect(brief.markdown).toContain('## Limits\n\n- Stay in docs/');
    expect(brief.markdown).not.toContain('## Success');
  });

  it('rejects a body without ids with 400 and an unknown id with 404', async () => {
    expect((await post({ ids: [] })).status).toBe(400);
    expect((await post({ ids: ['TASKS-9'] })).status).toBe(404);
  });
});
