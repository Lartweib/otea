import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { getItem, listItems, showItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { memoryContext, projectOf } from '../app/testing.ts';
import { evidencePreset } from '../core/testing.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, SESSION_COOKIE, TOKEN } from './testing.ts';
import { HUMAN_IN_UI, MAX_INTAKE_FILES } from './writes.ts';

const ORIGIN = `http://${LOCAL_HOST}`;

type Part = { name: string; content?: string };

const errorOf = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

describe('POST /api/items as a form, with files', () => {
  let project: Project;
  let server: OteaServer;

  const send = (form: FormData, headers: Record<string, string> = {}) =>
    Promise.resolve(
      server.app.request('/api/items', {
        method: 'POST',
        body: form,
        headers: { host: LOCAL_HOST, origin: ORIGIN, cookie: SESSION_COOKIE, ...headers },
      }),
    );
  const formOf = (item: unknown, files: Part[]) => {
    const form = new FormData();
    form.append('item', typeof item === 'string' ? item : JSON.stringify(item));
    for (const { name, content = 'bytes' } of files) form.append('file', new File([content], name));
    return form;
  };
  const bug = (evidence?: unknown[]) => ({
    collection: 'proof',
    type: 'bug',
    fields: { title: 'Ledge grab misses' },
    ...(evidence ? { evidence } : {}),
  });

  beforeEach(() => {
    project = projectOf(
      mkdtempSync(join(tmpdir(), 'otea-create-files-')),
      memoryContext(evidencePreset),
    );
    addCollection(project, { name: 'proof', preset: 'proof' });
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    server.close();
    project.db.close();
    rmSync(project.root, { recursive: true, force: true });
  });

  it('creates the item with its files as evidence, in the roles given', async () => {
    const form = formOf(bug([{ role: 'before' }, {}]), [
      { name: 'ledge.png', content: 'png' },
      { name: 'boot.log', content: 'log' },
    ]);

    const response = await send(form);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: 'PROOF-1', state: 'open' });
    expect(showItem(project, 'PROOF-1', HUMAN_IN_UI).evidence).toMatchObject([
      { filename: 'ledge.png', role: 'before', size: 3, channel: 'ui' },
      { filename: 'boot.log', role: 'single', size: 3 },
    ]);
  });

  it('keeps only the base name of a file', async () => {
    await send(formOf(bug(), [{ name: '..\\..\\secret\\boot.log' }]));

    expect(showItem(project, 'PROOF-1', HUMAN_IN_UI).evidence).toMatchObject([
      { filename: 'boot.log' },
    ]);
  });

  it('creates nothing when a file is refused by the modules', async () => {
    const response = await send(formOf(bug(), [{ name: 'notes.docx' }]));

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toBe('evidence_not_accepted');
    expect(listItems(project)).toEqual([]);
  });

  it('creates an item from a form without files', async () => {
    const response = await send(formOf(bug(), []));

    expect(response.status).toBe(201);
    expect(getItem(project, 'PROOF-1').events.map(({ type }) => type)).toEqual(['created']);
  });

  it.each([
    ['an item part that is not json', '{'],
    ['an item part of the wrong shape', '{"collection":"proof"}'],
  ])('rejects %s with 400', async (_, item) => {
    const response = await send(formOf(item, []));

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe('invalid_body');
  });

  it('rejects an evidence entry without its file, and too many files', async () => {
    const missing = await send(formOf(bug([{}, {}]), [{ name: 'boot.log' }]));
    const many = Array.from({ length: MAX_INTAKE_FILES + 1 }, (_, at) => ({ name: `${at}.log` }));
    const tooMany = await send(formOf(bug(), many));

    expect(missing.status).toBe(400);
    expect(tooMany.status).toBe(400);
    expect(listItems(project)).toEqual([]);
  });

  it('rejects a form from a foreign origin', async () => {
    const response = await send(formOf(bug(), [{ name: 'boot.log' }]), {
      origin: 'http://evil.example',
    });

    expect(response.status).toBe(403);
    expect(listItems(project)).toEqual([]);
  });

  it('takes a form only to create an item', async () => {
    const form = new FormData();
    form.append('to', 'closed');

    const response = await Promise.resolve(
      server.app.request('/api/items/PROOF-1/move', {
        method: 'POST',
        body: form,
        headers: { host: LOCAL_HOST, origin: ORIGIN, cookie: SESSION_COOKIE },
      }),
    );

    expect(response.status).toBe(415);
  });
});
