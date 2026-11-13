// The PowerShell script the Windows installer runs to put `otea` on the user's PATH, run here in its
// dry mode (-Current), which prints the PATH it would write and touches nothing.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../build/path.ps1', import.meta.url));
const BIN = 'C:\\Users\\ana\\AppData\\Local\\Programs\\Otea\\resources\\bin';

function dryRun(action: 'add' | 'remove', current: string): string {
  return execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      SCRIPT,
      '-Action',
      action,
      '-Dir',
      BIN,
      '-Current',
      current,
    ],
    { encoding: 'utf8', windowsHide: true },
  ).trim();
}

describe.runIf(process.platform === 'win32')('path.ps1', () => {
  it('adds the bin folder at the end, keeping the rest unexpanded', () => {
    expect(dryRun('add', '%USERPROFILE%\\bin;C:\\tools')).toBe(
      `%USERPROFILE%\\bin;C:\\tools;${BIN}`,
    );
  });

  it('adds it to an empty PATH', () => {
    expect(dryRun('add', '')).toBe(BIN);
  });

  it('adds it once, whatever the case or trailing slash', () => {
    const current = `C:\\tools;${BIN.toUpperCase()}\\`;
    expect(dryRun('add', current)).toBe(current);
  });

  it('takes out only its own entry', () => {
    expect(dryRun('remove', `C:\\tools;${BIN};%USERPROFILE%\\bin`)).toBe(
      'C:\\tools;%USERPROFILE%\\bin',
    );
    expect(dryRun('remove', 'C:\\tools')).toBe('C:\\tools');
    expect(dryRun('remove', BIN)).toBe('');
  });
});
