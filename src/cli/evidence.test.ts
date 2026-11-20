import { execFileSync } from 'node:child_process';
import { readFileSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openProject } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { creatures } from '../core/board/testing.ts';
import { MAX_EVIDENCE_BYTES } from '../core/evidence.ts';
import {
  type Cli,
  cliAt,
  declareProfiles,
  presetCollection,
  type SeededRepo,
  seededLocalRepo,
  type TempRepo,
  tempGitRepo,
} from './testing.ts';

describe('attach', () => {
  let seeded: SeededRepo;
  let repo: TempRepo;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  const errorCode = (err: string) => JSON.parse(err).error.code;

  // Every test starts from the same task, seeded once and copied per test.
  beforeAll(async () => {
    seeded = await seededLocalRepo(async (dir) => {
      const seed = cliAt(dir, { OTEA_AGENT: 'claude' });
      await seed('init', '--local');
      declareProfiles(dir, 'claude', 'claude-a', 'claude-b', 'codex', 'gemini', 'quill');
      presetCollection(dir, 'tasks');
      await seed('create', '--collection', 'tasks', '--title', 'Crash', '--description', 'On save');
    });
  });

  afterAll(() => seeded.remove());

  beforeEach(() => {
    repo = seeded.fresh();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    repo.write('shots/before.png', 'png-before');
    repo.write('test.log', 'PASS 12 tests\n');
  });

  afterEach(() => repo.remove());

  it('attaches a file given relative to the working directory and prints the entry', async () => {
    const { code, out } = await otea(
      'attach',
      'TASKS-1',
      'shots/before.png',
      '--role',
      'before',
      '--caption',
      'Blank page after save',
    );

    expect(code).toBe(0);
    expect(out).toBe('#1  before  image  before.png  10 B  Blank page after save\n');
  });

  it('says when a diagram is outside the Mermaid flowchart Otea draws, and keeps it', async () => {
    repo.write('seq.mmd', 'sequenceDiagram\n  A->>B: hola\n');
    repo.write('flow.mmd', 'flowchart LR\n  A[Inicio] --> B[Fin]\n');

    const seq = await otea('attach', 'TASKS-1', 'seq.mmd');
    const flow = await otea('attach', 'TASKS-1', 'flow.mmd');

    expect(seq.code).toBe(0);
    expect(seq.out).toContain(
      'Otea cannot draw seq.mmd (line 1: expected "flowchart LR" (or TD, RL, BT) first): the person sees its source',
    );
    expect(seq.out).toContain('flowchart or graph LR|TD|RL|BT');
    expect(flow.out).not.toContain('cannot draw');
    repo.write('hex.mmd', 'flowchart LR\n  A{{Hex}} --> B\n');
    expect((await json('attach', 'TASKS-1', 'hex.mmd')).cannotDraw).toMatch(
      /^Otea cannot draw hex\.mmd \(line 2: /,
    );
  });

  it('prints the entry with --json', async () => {
    expect(await json('attach', 'TASKS-1', 'test.log')).toMatchObject({
      id: 1,
      itemId: 'TASKS-1',
      role: 'single',
      kind: 'log',
      filename: 'test.log',
      contentType: 'text/plain',
      size: 14,
      caption: null,
      actor: { kind: 'agent', name: 'claude' },
      channel: 'cli',
    });
  });

  it('says the same file attached again adds nothing, and marks it in --json', async () => {
    await otea('attach', 'TASKS-1', 'test.log');

    expect(await otea('attach', 'TASKS-1', 'test.log')).toMatchObject({
      code: 0,
      out: '#1  single  log  test.log  14 B\nTASKS-1 already has this file as #1; nothing added.\n',
    });
    expect(await json('attach', 'TASKS-1', 'test.log')).toMatchObject({ id: 1, duplicate: true });
    expect((await json('show', 'TASKS-1')).evidence).toHaveLength(1);
  });

  it('resolves a relative path against the working directory, not the project root', async () => {
    const inShots = cliAt(join(repo.dir, 'shots'), { OTEA_AGENT: 'claude' });

    expect((await inShots('attach', 'TASKS-1', 'before.png')).code).toBe(0);
  });

  it('stores the copy under .otea/evidence, which git ignores', async () => {
    const { sha256 } = await json('attach', 'TASKS-1', 'test.log');
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: repo.dir,
      encoding: 'utf8',
    });

    expect(readFileSync(join(repo.dir, '.otea', 'evidence', sha256), 'utf8')).toBe(
      'PASS 12 tests\n',
    );
    expect(status).not.toContain('.otea');
    expect(status).toContain('test.log');
  });

  it('lists the evidence in show, above the events that record it', async () => {
    await otea('attach', 'TASKS-1', 'shots/before.png', '--role', 'before', '--caption', 'Blank');
    await otea('attach', 'TASKS-1', 'test.log');

    const { out } = await otea('show', 'TASKS-1');

    expect(out).toMatch(
      /Evidence:\n {2}#1 {2}before {2}image {2}before\.png {2}10 B {2}Blank\n {2}#2 {2}single {2}log {4}test\.log {4}14 B\n {2}Open a file at its number and name: #1 is \S+[\\/]1[\\/]before\.png\n\nEvents:/,
    );
    expect(out).toMatch(
      /agent:claude {2}evidence_added {2}#1 before image before\.png \("Blank"\)/,
    );
    expect((await json('show', 'TASKS-1')).evidence).toHaveLength(2);
  });

  // A file the person attached (Referencias) had only its name and hash: the agent said it found no
  // sketch (P5-R2-4). show gives each file a path to open, under the name it was attached with.
  it('gives each file a path an agent can open, under its own name', async () => {
    await otea('attach', 'TASKS-1', 'shots/before.png', '--role', 'before');

    const [entry] = (await json('show', 'TASKS-1')).evidence;
    expect(entry.path).toMatch(/[\\/]before\.png$/);
    expect(readFileSync(entry.path, 'utf8')).toBe('png-before');
    expect((await otea('show', 'TASKS-1')).out).toContain(entry.path);
    const again = (await json('show', 'TASKS-1')).evidence[0];
    expect(again.path).toBe(entry.path);
  });

  it('leaves show without an evidence section when there is none', async () => {
    expect((await otea('show', 'TASKS-1')).out).not.toContain('Evidence:');
    expect((await json('show', 'TASKS-1')).evidence).toEqual([]);
  });

  it('records the attachment in the event log', async () => {
    await otea('attach', 'TASKS-1', 'test.log');

    expect((await otea('events', '--since', '1')).out).toMatch(
      /^2 {2}TASKS-1 {2}\d{4}-\d\d-\d\d \d\d:\d\d UTC {2}agent:claude {2}evidence_added {2}#1 single log test\.log\n$/,
    );
    expect((await json('events', '--since', '1')).type).toBe('evidence_added');
  });

  it('detaches a file attached by mistake, and says so in show', async () => {
    await otea('attach', 'TASKS-1', 'test.log');
    await otea('attach', 'TASKS-1', 'shots/before.png');

    const { code, out } = await otea('detach', 'TASKS-1', '#2');

    expect(code).toBe(0);
    expect(out).toBe('Detached #2 before.png from TASKS-1.\n');
    const shown = await otea('show', 'TASKS-1');
    expect(shown.out).toContain('Evidence:\n  #1  single  log  test.log  14 B\n  Open a file');
    expect(shown.out).toMatch(/evidence_detached {2}#2 before\.png/);
    expect((await otea('detach', 'TASKS-1', 'two')).code).toBe(2);
    const again = await otea('detach', 'TASKS-1', '2', '--json');
    expect(again.code).toBe(3);
    expect(errorCode(again.err)).toBe('not_found');
  });

  describe('refusals', () => {
    it('refuses an unknown role as a usage error (exit 2)', async () => {
      const { code, err } = await otea('attach', 'TASKS-1', 'test.log', '--role', 'during');

      expect(code).toBe(2);
      expect(err).toContain('--role must be one of before, after, single');
    });

    it('refuses a missing file with file_not_found (exit 3)', async () => {
      const { code, err } = await otea('attach', 'TASKS-1', 'nope.png', '--json');

      expect(code).toBe(3);
      expect(errorCode(err)).toBe('file_not_found');
    });

    it('refuses a file over the size limit with evidence_too_large (exit 14)', async () => {
      repo.write('huge.mp4', '');
      truncateSync(join(repo.dir, 'huge.mp4'), MAX_EVIDENCE_BYTES + 1);

      const { code, err } = await otea('attach', 'TASKS-1', 'huge.mp4', '--json');

      expect(code).toBe(14);
      expect(errorCode(err)).toBe('evidence_too_large');
    });

    it('refuses an item another agent holds with lease_held (exit 12)', async () => {
      await otea('claim', 'TASKS-1', '--as', 'codex');

      const { code, err } = await otea('attach', 'TASKS-1', 'test.log', '--json');

      expect(code).toBe(12);
      expect(errorCode(err)).toBe('lease_held');
    });

    it('refuses a closed item with item_closed (exit 4)', async () => {
      await otea('create', '--collection', 'tasks', '--title', 'Vague');
      await otea('relay', 'TASKS-2', 'dropped', '--quote', 'Drop it', '--reason', 'Too vague');

      const { code, err } = await otea('attach', 'TASKS-2', 'test.log', '--json');

      expect(code).toBe(4);
      expect(errorCode(err)).toBe('item_closed');
    });
  });
});

// A board names its parts; show must still file each picture under the part it went to.
describe('show on a board with two picture parts', () => {
  let repo: TempRepo;
  let otea: Cli;
  let id: string;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local', '--template', 'none');
    const project = openProject(repo.dir);
    try {
      publishAs(project, creatures(), 'bcre');
    } finally {
      project.db.close();
    }
    const created = await otea(
      'create',
      '--collection',
      'Criaturas',
      '--title',
      'Sapo',
      '--field',
      'Descripción=verde',
      '--json',
    );
    id = JSON.parse(created.out).id;
    repo.write('mud.png', 'png-mud');
  });

  afterEach(() => repo.remove());

  it('lists a picture under the part it was attached to, not the first that takes pictures', async () => {
    await otea('claim', id);
    expect((await otea('attach', id, 'mud.png', '--module', 'Barro')).code).toBe(0);

    const { out } = await otea('show', id);

    expect(out).toMatch(/Arte conceptual \([^)]*\)\n {4}nothing yet/);
    expect(out).toMatch(/Barro \([^)]*\)\n {4}#1 {2}single {2}image {2}mud\.png/);
  });
});
