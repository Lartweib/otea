import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProjectPath, openRegistry, oteaHome, projectAt, registerProject } from './home.ts';

describe('home', () => {
  let dir: string;

  beforeEach(() => {
    dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-registry-')));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('oteaHome', () => {
    it('is OTEA_HOME when set', () => {
      expect(oteaHome({ OTEA_HOME: dir })).toBe(dir);
    });

    it('is set by the test setup for every test file', () => {
      expect(process.env.OTEA_HOME).toContain('otea-home-');
    });

    it('refuses the real home folder inside tests', () => {
      expect(() => homedir()).toThrow(/OTEA_HOME/);
      expect(() => oteaHome({})).toThrow(/OTEA_HOME/);
    });
  });

  describe('registry', () => {
    let registry: DatabaseSync;
    let product: string;
    let api: string;

    beforeEach(() => {
      registry = openRegistry({ OTEA_HOME: join(dir, 'home') });
      product = join(dir, 'Product');
      api = join(product, 'api');
      mkdirSync(join(api, 'src'), { recursive: true });
      registerProject(registry, {
        id: 'product-aaaaaa',
        name: 'Product',
        storage: 'common',
        dataDir: join(dir, 'home', 'data', 'product-aaaaaa'),
      });
    });

    afterEach(() => registry.close());

    it('is created in OTEA_HOME', () => {
      expect(existsSync(join(dir, 'home', 'registry.db'))).toBe(true);
    });

    it('finds the project of the nearest linked folder', () => {
      registerProject(registry, { id: 'api-bbbbbb', name: 'api', storage: 'local', dataDir: api });
      addProjectPath(registry, 'product-aaaaaa', product, 'folder');
      addProjectPath(registry, 'api-bbbbbb', api, 'repo');

      expect(projectAt(registry, product)?.id).toBe('product-aaaaaa');
      expect(projectAt(registry, join(api, 'src'))).toEqual({
        id: 'api-bbbbbb',
        name: 'api',
        storage: 'local',
        dataDir: api,
      });
      expect(projectAt(registry, dir)).toBeUndefined();
    });

    it('links several paths to one project', () => {
      const web = join(dir, 'web');
      mkdirSync(web);
      addProjectPath(registry, 'product-aaaaaa', api, 'repo');
      addProjectPath(registry, 'product-aaaaaa', web, 'repo');

      expect(projectAt(registry, api)?.id).toBe('product-aaaaaa');
      expect(projectAt(registry, web)?.id).toBe('product-aaaaaa');
    });

    it('refuses a path that is already linked', () => {
      addProjectPath(registry, 'product-aaaaaa', product, 'folder');

      expect(() => addProjectPath(registry, 'product-aaaaaa', product, 'repo')).toThrow(
        expect.objectContaining({ code: 'already_exists' }),
      );
    });

    it('keeps the real path and compares by its key', () => {
      const linked = addProjectPath(registry, 'product-aaaaaa', product, 'folder');

      expect(linked.path).toBe(product);
      if (process.platform === 'win32' || process.platform === 'darwin') {
        expect(linked.pathKey).toBe(product.replaceAll('\\', '/').toLowerCase());
        expect(projectAt(registry, product.toUpperCase())?.id).toBe('product-aaaaaa');
      }
    });

    it('keeps its data when opened again', () => {
      addProjectPath(registry, 'product-aaaaaa', product, 'folder');
      registry.close();
      registry = openRegistry({ OTEA_HOME: join(dir, 'home') });

      expect(projectAt(registry, api)?.id).toBe('product-aaaaaa');
    });
  });
});
