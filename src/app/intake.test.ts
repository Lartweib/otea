import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Performer } from '../core/authority.ts';
import { creatures } from '../core/board/testing.ts';
import { MAX_EVIDENCE_BYTES } from '../core/evidence.ts';
import { evidencePreset } from '../core/testing.ts';
import { selectEvidence } from '../store/queries.ts';
import { addCollection } from './collections.ts';
import { evidenceDir } from './evidence.ts';
import { createItemWithEvidence } from './intake.ts';
import { getItem, listItems, showItem } from './items.ts';
import { boardBlockOf } from './next.ts';
import type { Project } from './project.ts';
import { memoryContext, projectOf, publishAs } from './testing.ts';

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

// ONB3-4: what the person files a new item with is theirs, not an agent's deliverable. It goes to a
// part the board's creation form asks for, or stays with the item outside the parts.
describe('createItemWithEvidence on a board, as the person', () => {
  let project: Project;
  let root: string;
  const MP4 = Buffer.from('not really a video');

  const create = (files: Parameters<typeof createItemWithEvidence>[2]) =>
    createItemWithEvidence(
      project,
      { collection: 'Criaturas', title: 'Sapo', fields: { fdesc: 'verde' }, ...HUMAN },
      files,
      () => T0,
    );
  const shown = (id: string) =>
    showItem(project, id, HUMAN).evidence.map(({ filename, module }) => [filename, module]);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-intake-board-'));
    project = projectOf(root, memoryContext());
    const def = creatures();
    // Barro (images) is asked for when the item is created; Arte conceptual (images) and
    // Animación (video) are what the agents hand off.
    def.form.push({ ref: 'eswamp', required: false });
    publishAs(project, def, 'bcre', () => T0);
  });

  afterEach(() => {
    project.db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('puts a picture in the part the creation form asks for, not the first that takes it', () => {
    const { id } = create([{ filename: 'mud.png', bytes: PNG }]);

    expect(shown(id)).toEqual([['mud.png', 'eswamp']]);
  });

  it("keeps a file no form part takes with the item, out of the agents' parts", () => {
    const { id } = create([{ filename: 'clip.mp4', bytes: MP4 }]);

    expect(shown(id)).toEqual([['clip.mp4', null]]);
    const block = boardBlockOf(project, getItem(project, id));
    expect(block?.missing.map(({ ref }) => ref)).toContain('eart');
  });

  it('puts a file in the part the person names', () => {
    const { id } = create([{ filename: 'art.png', bytes: PNG, module: 'eart' }]);

    expect(shown(id)).toEqual([['art.png', 'eart']]);
  });
});
