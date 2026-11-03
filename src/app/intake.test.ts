import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Performer } from '../core/authority.ts';
import { MAX_EVIDENCE_BYTES } from '../core/evidence.ts';
import { evidencePreset } from '../core/testing.ts';
import { selectEvidence } from '../store/queries.ts';
import { addCollection } from './collections.ts';
import { evidenceDir } from './evidence.ts';
import { createItemWithEvidence } from './intake.ts';
import { getItem, listItems } from './items.ts';
import type { Project } from './project.ts';
import { memoryContext, projectOf } from './testing.ts';

const HUMAN: Performer = { actor: { kind: 'human', name: 'human' }, channel: 'ui' };
const T0 = '2026-01-01T00:00:00.000Z';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const LOG = Buffer.from('boot\nfail\n');

describe('createItemWithEvidence', () => {
  let project: Project;
  let root: string;

  const create = (type: string, files: Parameters<typeof createItemWithEvidence>[2]) =>
    createItemWithEvidence(
      project,
      { collection: 'proof', type, title: 'Ledge grab misses', ...HUMAN },
      files,
      () => T0,
    );

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-intake-'));
    project = projectOf(root, memoryContext(evidencePreset));
    addCollection(project, { name: 'proof', preset: 'proof' });
  });

  afterEach(() => {
    project.db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the item and attaches each file to the module that takes it', () => {
    const created = create('bug', [
      { filename: 'before.png', bytes: PNG, role: 'before' },
      { filename: 'boot.log', bytes: LOG },
    ]);

    expect(created).toMatchObject({ id: 'PROOF-1', state: 'open', turn: 'agent' });
    expect(created.evidence).toMatchObject([
      { filename: 'before.png', role: 'before', kind: 'image', actor: HUMAN.actor, channel: 'ui' },
      { filename: 'boot.log', role: 'single', kind: 'log' },
    ]);
    expect(getItem(project, 'PROOF-1').events.map(({ type }) => type)).toEqual([
      'created',
      'evidence_added',
      'evidence_added',
    ]);
  });

  it('creates nothing and stores no file when one file is refused', () => {
    const refused = () =>
      create('bug', [
        { filename: 'before.png', bytes: PNG, role: 'before' },
        { filename: 'shot.png', bytes: PNG, role: 'single' },
      ]);

    expect(refused).toThrow(expect.objectContaining({ code: 'invalid_role' }));
    expect(listItems(project)).toEqual([]);
    expect(existsSync(evidenceDir(project.dataDir))).toBe(false);
  });

  it('refuses a file over the evidence limit', () => {
    const big = Buffer.alloc(MAX_EVIDENCE_BYTES + 1);

    expect(() => create('bug', [{ filename: 'huge.log', bytes: big }])).toThrow(
      expect.objectContaining({ code: 'evidence_too_large' }),
    );
    expect(listItems(project)).toEqual([]);
    expect(selectEvidence(project.db, 'PROOF-1')).toEqual([]);
  });
});
