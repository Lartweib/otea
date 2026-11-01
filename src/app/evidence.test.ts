import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_EVIDENCE_BYTES } from '../core/evidence.ts';
import type { Actor } from '../core/item.ts';
import { evidencePreset } from '../core/testing.ts';
import { addCollection } from './collections.ts';
import { type AttachInput, attachEvidence, evidenceDir, evidenceFile } from './evidence.ts';
import { createItem, getItem, moveItem, showItem } from './items.ts';
import { claimItem } from './leases.ts';
import type { Project } from './project.ts';
import { memoryContext } from './testing.ts';

const claude: Actor = { kind: 'agent', name: 'claude' };
const codex: Actor = { kind: 'agent', name: 'codex' };

const T0 = '2026-01-01T00:00:00.000Z';
const T5 = '2026-01-01T00:05:00.000Z';

const at = (time: string) => () => time;

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const SHA_PNG = createHash('sha256').update(PNG).digest('hex');

describe('attachEvidence', () => {
  let project: Project;
  let files: string;

  const file = (name: string, content: string | Buffer = PNG) => {
    const path = join(files, name);
    writeFileSync(path, content);
    return path;
  };
  const attach = (input: Partial<AttachInput> = {}) =>
    attachEvidence(
      project,
      { id: 'TASKS-1', path: file('repro.png'), actor: claude, channel: 'cli', ...input },
      at(T5),
    );
  const stored = () => readdirSync(evidenceDir(project.root));

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'otea-evidence-'));
    files = join(root, 'files');
    mkdirSync(files);
    project = { root, ...memoryContext() };
    addCollection(project, { name: 'tasks' });
    const fields = { description: 'Details' };
    createItem(project, { collection: 'tasks', title: 'First', fields, actor: claude }, at(T0));
  });

  afterEach(() => {
    project.db.close();
    rmSync(project.root, { recursive: true, force: true });
  });

  it('copies the file into the project, addressed by its sha256, and returns the entry', () => {
    const evidence = attach({ role: 'before', caption: 'Crash on save' });

    expect(evidence).toEqual({
      id: 1,
      itemId: 'TASKS-1',
      role: 'before',
      module: null,
      kind: 'image',
      filename: 'repro.png',
      contentType: 'image/png',
      size: PNG.length,
      sha256: SHA_PNG,
      caption: 'Crash on save',
      createdAt: T5,
      actor: claude,
      channel: 'cli',
    });
    expect(readFileSync(evidenceFile(project.root, SHA_PNG))).toEqual(PNG);
  });

  it('defaults to the single role and no caption, and ignores a blank caption', () => {
    expect(attach()).toMatchObject({ role: 'single', caption: null });
    expect(attach({ caption: '  ' })).toMatchObject({ caption: null });
  });

  it('stores the same content once however often it is attached', () => {
    const first = attach();
    const second = attach({ path: file('copy.png'), role: 'after' });

    expect(second.sha256).toBe(first.sha256);
    expect(second.id).toBe(2);
    expect(stored()).toEqual([first.sha256]);
  });

  it('derives the kind from the extension', () => {
    expect(attach({ path: file('fix.diff', '--- a\n+++ b\n') })).toMatchObject({
      kind: 'diff',
      contentType: 'text/x-diff',
    });
    expect(attach({ path: file('test.log', 'ok\n') }).kind).toBe('log');
    expect(attach({ path: file('icon.svg', '<svg/>') }).kind).toBe('file');
  });

  it('appends an evidence_added event with the channel', () => {
    attach({ role: 'after', caption: 'Fixed', channel: 'mcp' });

    expect(getItem(project, 'TASKS-1', at(T5)).events.at(-1)).toEqual({
      id: 2,
      itemId: 'TASKS-1',
      type: 'evidence_added',
      actor: claude,
      at: T5,
      data: {
        evidenceId: 1,
        role: 'after',
        kind: 'image',
        filename: 'repro.png',
        caption: 'Fixed',
        channel: 'mcp',
      },
    });
  });

  it('lists the evidence of the item in showItem, oldest first', () => {
    attach({ role: 'before' });
    attach({ path: file('after.png', 'other'), role: 'after' });

    const shown = showItem(project, 'TASKS-1', { actor: claude, channel: 'cli' }, at(T5));

    expect(shown.evidence.map(({ id, role }) => [id, role])).toEqual([
      [1, 'before'],
      [2, 'after'],
    ]);
  });

  describe('refusals', () => {
    const refused = (input: Partial<AttachInput>, code: string) => {
      expect(() => attach(input)).toThrow(expect.objectContaining({ code }));
      expect(getItem(project, 'TASKS-1', at(T5)).events.map(({ type }) => type)).not.toContain(
        'evidence_added',
      );
    };

    it('refuses an item another agent holds with lease_held, storing nothing', () => {
      claimItem(project, { id: 'TASKS-1', actor: codex }, at(T0));

      refused({}, 'lease_held');
      expect(() => stored()).toThrow();
    });

    it('lets the lease holder attach', () => {
      claimItem(project, { id: 'TASKS-1', actor: claude }, at(T0));

      expect(attach().id).toBe(1);
    });

    it('refuses a closed item with item_closed', () => {
      createItem(project, { collection: 'tasks', title: 'Vague', actor: claude }, at(T0));
      const reason = 'Too vague';
      moveItem(project, { id: 'TASKS-2', to: 'discarded', actor: claude, channel: 'cli', reason });

      expect(() => attach({ id: 'TASKS-2' })).toThrow(
        'TASKS-2 is discarded (turn none) and can no longer take evidence',
      );
      expect(() => attach({ id: 'TASKS-2' })).toThrow(
        expect.objectContaining({ code: 'item_closed' }),
      );
    });

    it('refuses an unknown item with not_found', () => {
      expect(() => attach({ id: 'TASKS-9' })).toThrow(
        expect.objectContaining({ code: 'not_found' }),
      );
    });

    it('refuses a missing file with file_not_found', () => {
      refused({ path: join(files, 'nope.png') }, 'file_not_found');
    });

    it('refuses a directory with file_not_found', () => {
      refused({ path: files }, 'file_not_found');
    });

    it(`refuses a file over ${MAX_EVIDENCE_BYTES} bytes with evidence_too_large`, () => {
      const big = file('huge.mp4', '');
      truncateSync(big, MAX_EVIDENCE_BYTES + 1);

      refused({ path: big }, 'evidence_too_large');
      expect(() => attach({ path: big })).toThrow('huge.mp4 is over the 50 MB evidence limit');
    });

    it('accepts a file of exactly the limit', () => {
      const edge = file('edge.mp4', '');
      truncateSync(edge, MAX_EVIDENCE_BYTES);

      expect(attach({ path: edge }).size).toBe(MAX_EVIDENCE_BYTES);
    }, 30_000); // hashing and copying 50 MB can pass the 5s default on a slow CI runner
  });
});

describe('attachEvidence to a type that places evidence modules', () => {
  let project: Project;
  let files: string;

  const file = (name: string, content: string | Buffer = PNG) => {
    const path = join(files, name);
    writeFileSync(path, content);
    return path;
  };
  const attach = (id: string, name: string, input: Partial<AttachInput> = {}) =>
    attachEvidence(
      project,
      { id, path: file(name), actor: claude, channel: 'mcp', ...input },
      at(T5),
    );
  const events = (id: string) => getItem(project, id, at(T5)).events.map(({ type }) => type);

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'otea-evidence-'));
    files = join(root, 'files');
    mkdirSync(files);
    project = { root, ...memoryContext(evidencePreset) };
    addCollection(project, { name: 'proof', preset: 'proof' });
    for (const type of ['bug', 'impr']) {
      createItem(project, { collection: 'proof', type, title: type, actor: claude }, at(T0));
    }
  });

  afterEach(() => {
    project.db.close();
    rmSync(project.root, { recursive: true, force: true });
  });

  it('records the module a file goes to, and records it on the event', () => {
    expect(attach('PROOF-1', 'run.log')).toMatchObject({ module: 'log', role: 'single' });
    expect(attach('PROOF-1', 'before.png', { role: 'before' })).toMatchObject({
      module: 'images',
      role: 'before',
    });
    expect(getItem(project, 'PROOF-1', at(T5)).events.at(-1)?.data).toMatchObject({
      module: 'images',
    });
  });

  it('places a file in the module named by --module when two accept it', () => {
    expect(attach('PROOF-2', 'home.png', { module: 'mockup' }).module).toBe('mockup');
  });

  it.each<[string, string, Partial<AttachInput>, string]>([
    ['a kind no module accepts', 'PROOF-1', {}, 'evidence_not_accepted'],
    ['an ambiguous module', 'PROOF-2', {}, 'module_required'],
    ['a compare without a role', 'PROOF-1', {}, 'invalid_role'],
  ])('refuses %s, storing nothing', (_, id, input, code) => {
    const name = code === 'evidence_not_accepted' ? 'clip.mp4' : 'shot.png';
    expect(() => attach(id, name, input)).toThrow(expect.objectContaining({ code }));
    expect(events(id)).not.toContain('evidence_added');
    expect(() => readdirSync(evidenceDir(project.root))).toThrow();
  });

  it('shows each entry with the module that draws it, falling back for older evidence', () => {
    attach('PROOF-2', 'home.png', { module: 'mockup' });
    project.db.exec(`INSERT INTO evidence (item_id, role, kind, filename, content_type, size,
      sha256, caption, created_at, actor_kind, actor_name, channel)
      VALUES ('PROOF-2', 'single', 'image', 'old.png', 'image/png', 1, 'abc', NULL, 't', 'agent',
        'bot', 'cli')`);

    const shown = showItem(project, 'PROOF-2', { actor: claude, channel: 'cli' }, at(T5));

    expect(shown.evidence.map(({ filename, module }) => [filename, module])).toEqual([
      ['home.png', 'mockup'],
      ['old.png', 'screens'],
    ]);
  });
});
