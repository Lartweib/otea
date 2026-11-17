import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectArg, secondLaunchProject } from './launch.ts';

const HERE = resolve('/work/here');

describe('projectArg', () => {
  it('reads --project <dir> and --project=<dir>, resolved against the launch folder', () => {
    expect(projectArg(['--project', 'repo'], HERE)).toBe(resolve(HERE, 'repo'));
    expect(projectArg(['--project=repo'], HERE)).toBe(resolve(HERE, 'repo'));
    expect(projectArg(['--project', resolve('/abs/repo')], HERE)).toBe(resolve('/abs/repo'));
  });

  it('is undefined without a folder after it', () => {
    expect(projectArg([], HERE)).toBeUndefined();
    expect(projectArg(['--project'], HERE)).toBeUndefined();
    expect(projectArg(['--project', '--allow-file-access-from-files'], HERE)).toBeUndefined();
  });
});

describe('secondLaunchProject', () => {
  it('takes the folder the second launch resolved itself and handed over', () => {
    const dir = resolve('/abs/repo');
    // Chromium reorders and adds switches to the argv the first instance receives.
    const argv = ['Otea.exe', '--project', '--allow-file-access-from-files', 'repo'];
    expect(secondLaunchProject({ project: dir }, argv, HERE)).toBe(dir);
  });

  it('falls back to the argv, resolved against the second launch’s folder', () => {
    expect(secondLaunchProject(undefined, ['Otea.exe', '--project', 'repo'], HERE)).toBe(
      resolve(HERE, 'repo'),
    );
    expect(secondLaunchProject({}, ['Otea.exe'], HERE)).toBeUndefined();
  });
});
