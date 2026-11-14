import { describe, expect, it } from 'vitest';
import { ownerOnlyCommand, restrictToOwner } from './owner-only.ts';

// A secret file kept to its owner: mode 0600 on POSIX; on Windows, which ignores the mode, an ACL
// that grants the current user alone (icacls, run without a shell). Failing soft: a warning, never
// a stop. These tests run a fake runner, so no file's ACL changes.

const recorder = (fail?: Error) => {
  const calls: { file: string; args: readonly string[] }[] = [];
  const run = (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    if (fail) throw fail;
  };
  return { calls, run };
};

const PATH = 'C:\\Users\\ana\\.otea\\p\\push-keys.json';

describe('the owner-only command on Windows', () => {
  it('drops inherited entries and grants the current user full control alone', () => {
    expect(ownerOnlyCommand(PATH, 'ana')).toEqual({
      file: 'icacls',
      args: [PATH, '/inheritance:r', '/grant:r', 'ana:F'],
    });
  });

  it('names the user with its domain when there is one', () => {
    expect(ownerOnlyCommand(PATH, 'ana', 'DESK').args.at(-1)).toBe('DESK\\ana:F');
  });
});

describe('restrictToOwner', () => {
  it('runs icacls on win32, as the current user', () => {
    const { calls, run } = recorder();
    const warnings: string[] = [];
    restrictToOwner(PATH, {
      platform: 'win32',
      env: { USERNAME: 'ana', USERDOMAIN: 'DESK' },
      run,
      warn: (m) => warnings.push(m),
    });
    expect(calls).toEqual([
      { file: 'icacls', args: [PATH, '/inheritance:r', '/grant:r', 'DESK\\ana:F'] },
    ]);
    expect(warnings).toEqual([]);
  });

  it('runs nothing elsewhere: the mode keeps the file to its owner there', () => {
    const { calls, run } = recorder();
    restrictToOwner(PATH, { platform: 'linux', env: { USERNAME: 'ana' }, run, warn: () => {} });
    expect(calls).toEqual([]);
  });

  it('warns and goes on when icacls fails', () => {
    const { run } = recorder(new Error('Access is denied.'));
    const warnings: string[] = [];
    expect(() =>
      restrictToOwner(PATH, {
        platform: 'win32',
        env: { USERNAME: 'ana' },
        run,
        warn: (m) => warnings.push(m),
      }),
    ).not.toThrow();
    expect(warnings).toEqual([
      `Could not keep ${PATH} to the current user (Access is denied.); other accounts on this computer may read it`,
    ]);
  });

  it('warns without running anything when it cannot tell the current user', () => {
    const { calls, run } = recorder();
    const warnings: string[] = [];
    restrictToOwner(PATH, { platform: 'win32', env: {}, run, warn: (m) => warnings.push(m) });
    expect(calls).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('no USERNAME');
  });
});
