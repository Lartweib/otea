import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, getItem, moveItem, showItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { memoryContext, projectOf } from '../app/testing.ts';
import { evidencePreset } from '../core/testing.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, SESSION_COOKIE, TOKEN } from './testing.ts';
import { HUMAN_IN_UI } from './writes.ts';

const ORIGIN = `http://${LOCAL_HOST}`;

const errorOf = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

// ONB-18: the person adds a file to an item that already exists, from the item's page.
describe('POST /api/items/:id/evidence', () => {
  let project: Project;
  let server: OteaServer;

  const send = (id: string, form: FormData, cookie = SESSION_COOKIE) =>
    Promise.resolve(
      server.app.request(`/api/items/${id}/evidence`, {
        method: 'POST',
        body: form,
        headers: { host: LOCAL_HOST, origin: ORIGIN, cookie },
      }),
    );
  const formOf = (files: string[], evidence?: unknown[]) => {
    const form = new FormData();
    if (evidence) form.append('evidence', JSON.stringify(evidence));
    for (const name of files) form.append('file', new File([`bytes of ${name}`], name));
    return form;
  };

  beforeEach(() => {
    project = projectOf(
      mkdtempSync(join(tmpdir(), 'otea-attach-files-')),
      memoryContext(evidencePreset),
    );
    addCollection(project, { name: 'proof', preset: 'proof' });
    createItem(project, {
      collection: 'proof',
      type: 'bug',
      title: 'Ledge grab misses',
      ...HUMAN_IN_UI,
    });
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
    rmSync(project.root, { recursive: true, force: true });
  });

  it('attaches the files as the person, in the roles given', async () => {
    const response = await send('PROOF-1', formOf(['ledge.png', 'boot.log'], [{ role: 'before' }]));

    expect(response.status).toBe(201);
    const evidence = showItem(project, 'PROOF-1', HUMAN_IN_UI).evidence;
    expect(evidence).toMatchObject([
      { filename: 'ledge.png', role: 'before', actor: HUMAN_IN_UI.actor, channel: 'ui' },
      { filename: 'boot.log', role: 'single' },
    ]);
    expect(getItem(project, 'PROOF-1').events.at(-1)?.type).toBe('evidence_added');
  });

  it('refuses a form with no file', async () => {
    const response = await send('PROOF-1', formOf([]));

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe('invalid_body');
  });

  it('refuses a closed item and attaches nothing', async () => {
    moveItem(project, {
      id: 'PROOF-1',
      to: 'closed',
      actor: { kind: 'agent', name: 'claude' },
      channel: 'cli',
    });

    const response = await send('PROOF-1', formOf(['ledge.png']));

    expect(await errorOf(response)).toBe('item_closed');
    expect(showItem(project, 'PROOF-1', HUMAN_IN_UI).evidence).toEqual([]);
  });

  it('refuses a browser that is not signed in', async () => {
    const response = await send('PROOF-1', formOf(['ledge.png']), '');

    expect(response.status).toBe(401);
  });
});
