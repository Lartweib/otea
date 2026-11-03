import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../store/database.ts';
import { addCollection } from './collections.ts';
import { attachEvidence } from './evidence.ts';
import { forgetProjectPath, listProjects, withRegistry } from './home.ts';
import { createItem, listItems } from './items.ts';
import { migrateToCommon } from './migrate.ts';
import { initProject, openProject } from './project.ts';

const NOW = new Date('2026-11-03T10:20:30.000Z');
const BACKUP = '.otea.migrated-20261103-102030';

describe('migrateToCommon', () => {
  let dir: string;
  let repo: string;
  let env: { OTEA_HOME: string };

  beforeEach(() => {
    dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-migrate-')));
    repo = join(dir, 'app');
    mkdirSync(repo);
    execFileSync('git', ['init', '--quiet'], { cwd: repo, stdio: 'ignore' });
    env = { OTEA_HOME: join(dir, 'home') };
    const project = initProject(repo, { local: true }, env);
    addCollection(project, { name: 'tasks' });
    const actor = { kind: 'agent', name: 'claude' } as const;
    createItem(project, { collection: 'tasks', title: 'Kept', fields: {}, actor });
    const file = join(dir, 'log.txt');
    writeFileSync(file, 'log');
    attachEvidence(project, { id: 'TASKS-1', path: file, actor, channel: 'cli' });
    project.db.close();
    mkdirSync(join(repo, '.otea', 'presets', 'mine'), { recursive: true });
    writeFileSync(join(repo, '.otea', 'presets', 'mine', 'preset.yaml'), 'preset: mine\n');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const titles = () => {
    const project = openProject(repo, env);
    try {
      return { storage: project.storage, titles: listItems(project, {}).map((i) => i.title) };
    } finally {
      project.db.close();
    }
  };

  it('moves the data into the Otea home, verified, and keeps the old folder as a backup', () => {
    const report = migrateToCommon(repo, env, NOW);

    expect(report).toMatchObject({
      status: 'migrated',
      root: repo,
      from: join(repo, '.otea'),
      backup: join(repo, BACKUP),
      to: join(env.OTEA_HOME, 'data', report.id),
      files: 2,
    });
    expect(report.tables.items).toEqual({ rows: 1, lastRowid: 1 });
    expect(report.undo[0]).toBe(`otea projects forget ${repo}`);
    expect(existsSync(join(repo, '.otea'))).toBe(false);
    expect(existsSync(join(repo, BACKUP, 'otea.db'))).toBe(true);
    expect(readdirSync(join(report.to, 'evidence'))).toHaveLength(1);
    expect(existsSync(join(report.to, 'presets', 'mine', 'preset.yaml'))).toBe(true);
    expect(titles()).toEqual({ storage: 'common', titles: ['Kept'] });
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
    expect(status).toBe('');
  });

  it("carries the project's blueprint copy, its playbook and its own blueprints along", () => {
    writeFileSync(join(repo, '.otea', 'blueprint.yaml'), 'blueprint: mine\n');
    writeFileSync(join(repo, '.otea', 'blueprint.md'), 'Coordinate.\n');
    mkdirSync(join(repo, '.otea', 'blueprints', 'mine'), { recursive: true });
    writeFileSync(join(repo, '.otea', 'blueprints', 'mine', 'blueprint.yaml'), 'blueprint: mine\n');

    const report = migrateToCommon(repo, env, NOW);

    expect(report.files).toBe(5);
    for (const path of ['blueprint.yaml', 'blueprint.md', 'blueprints/mine/blueprint.yaml']) {
      expect(existsSync(join(report.to, path))).toBe(true);
    }
  });

  it('keeps the project identity', () => {
    const before = openProject(repo, env);
    const identity = before.identity;
    before.db.close();

    const report = migrateToCommon(repo, env, NOW);

    expect(report.id).toBe(identity.id);
    const after = openProject(repo, env);
    expect(after.identity).toEqual(identity);
    after.db.close();
  });

  it('does nothing when run again', () => {
    migrateToCommon(repo, env, NOW);

    expect(migrateToCommon(repo, env, NOW)).toMatchObject({ status: 'already', backup: null });
    expect(readdirSync(repo).filter((name) => name.startsWith('.otea'))).toEqual([BACKUP]);
  });

  it('finishes a run that stopped before moving the old folder aside', () => {
    const first = migrateToCommon(repo, env, NOW);
    renameSync(join(repo, BACKUP), join(repo, '.otea'));

    const later = new Date('2026-11-04T00:00:00.000Z');
    expect(migrateToCommon(repo, env, later)).toMatchObject({
      status: 'finished',
      id: first.id,
      backup: join(repo, '.otea.migrated-20261104-000000'),
    });
    expect(existsSync(join(repo, '.otea'))).toBe(false);
  });

  it('refuses to finish when the old folder changed after the copy', () => {
    migrateToCommon(repo, env, NOW);
    renameSync(join(repo, BACKUP), join(repo, '.otea'));
    const db = openDatabase(join(repo, '.otea', 'otea.db'));
    db.exec("INSERT INTO collections (name, prefix, next_seq) VALUES ('late', 'LATE', 1)");
    db.close();

    expect(() => migrateToCommon(repo, env, NOW)).toThrow(
      expect.objectContaining({ code: 'in_use', message: expect.stringContaining('by hand') }),
    );
    expect(existsSync(join(repo, '.otea', 'otea.db'))).toBe(true);
  });

  it('can run again after the printed undo steps, once the copy is deleted', () => {
    const first = migrateToCommon(repo, env, NOW);
    withRegistry(env, (registry) => forgetProjectPath(registry, repo));
    renameSync(join(repo, BACKUP), join(repo, '.otea'));

    expect(titles().storage).toBe('local');
    expect(() => migrateToCommon(repo, env, NOW)).toThrow(
      expect.objectContaining({
        code: 'already_exists',
        message: expect.stringContaining(first.to),
      }),
    );
    rmSync(first.to, { recursive: true, force: true });
    expect(migrateToCommon(repo, env, NOW)).toMatchObject({ status: 'migrated', id: first.id });
    expect(titles()).toEqual({ storage: 'common', titles: ['Kept'] });
  });

  it.runIf(process.platform === 'win32')(
    'leaves everything as it was while another process holds the database',
    () => {
      const holder = openDatabase(join(repo, '.otea', 'otea.db'));
      try {
        expect(() => migrateToCommon(repo, env, NOW)).toThrow(
          expect.objectContaining({ code: 'in_use' }),
        );
      } finally {
        holder.close();
      }

      expect(existsSync(join(repo, '.otea', 'otea.db'))).toBe(true);
      expect(withRegistry(env, (registry) => listProjects(registry))).toEqual([]);
      expect(readdirSync(join(env.OTEA_HOME, 'data'))).toEqual([]);
      expect(titles()).toEqual({ storage: 'local', titles: ['Kept'] });
    },
  );
});
