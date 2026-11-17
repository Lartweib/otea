import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import { attachEvidence, detachEvidence } from './evidence.ts';
import { createItem, getItem, moveItem, showItem } from './items.ts';
import { claimItem } from './leases.ts';
import type { Project } from './project.ts';
import { memoryContext, projectOf } from './testing.ts';

const claude: Actor = { kind: 'agent', name: 'claude' };
const codex: Actor = { kind: 'agent', name: 'codex' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();

// An agent takes back a file it attached by mistake, while the item has not moved since.
describe('detachEvidence', () => {
  let project: Project;
  let files: string;

  const attach = (name: string, actor: Actor = claude) => {
    const path = join(files, name);
    writeFileSync(path, `content of ${name}`);
    return attachEvidence(project, { id: 'TASKS-1', path, actor, channel: 'cli' }, now);
  };
  const detach = (evidence: number, actor: Actor = claude) =>
    detachEvidence(project, { id: 'TASKS-1', evidence, actor, channel: 'cli' }, now);
  const listed = () =>
    showItem(project, 'TASKS-1', { actor: claude, channel: 'cli' }).evidence.map(
      ({ filename }) => filename,
    );

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'otea-detach-'));
    files = join(root, 'files');
    mkdirSync(files);
    project = projectOf(root, memoryContext());
    addCollection(project, { name: 'tasks' });
    createItem(
      project,
      { collection: 'tasks', title: 'First', fields: { description: 'Details' }, actor: claude },
      now,
    );
  });

  afterEach(() => {
    project.db.close();
    rmSync(project.root, { recursive: true, force: true });
  });

  it('takes the file off the item and records it in the history', () => {
    attach('right.log');
    const wrong = attach('wrong.log');

    const detached = detach(wrong.id);

    expect(detached.filename).toBe('wrong.log');
    expect(listed()).toEqual(['right.log']);
    const last = getItem(project, 'TASKS-1').events.at(-1);
    expect(last).toMatchObject({
      type: 'evidence_detached',
      actor: claude,
      data: { evidenceId: wrong.id, filename: 'wrong.log', channel: 'cli' },
    });
  });

  it('refuses a file another agent attached', () => {
    const theirs = attach('theirs.log', codex);

    expect(() => detach(theirs.id)).toThrow(expect.objectContaining({ code: 'forbidden' }));
    expect(listed()).toEqual(['theirs.log']);
  });

  it('refuses a file the item has moved on with', () => {
    const handed = attach('handed.log');
    moveItem(project, { id: 'TASKS-1', to: 'in_progress', actor: claude, channel: 'cli' }, now);

    expect(() => detach(handed.id)).toThrow(/stays in the record/);
    expect(listed()).toEqual(['handed.log']);
  });

  it('refuses a file it does not have, or one already detached, with not_found', () => {
    const once = attach('once.log');
    detach(once.id);

    expect(() => detach(once.id)).toThrow(expect.objectContaining({ code: 'not_found' }));
    expect(() => detach(99)).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('refuses while another agent holds the item', () => {
    const mine = attach('mine.log');
    claimItem(project, { id: 'TASKS-1', actor: codex }, now);

    expect(() => detach(mine.id)).toThrow(expect.objectContaining({ code: 'lease_held' }));
  });
});
