import { describe, expect, it, vi } from 'vitest';
import { adminScript, installCommand, type LinkPort, type LinkState } from './command-link.ts';

const TARGET = '/Applications/Otea.app/Contents/Resources/bin/otea';
const LINK = '/usr/local/bin/otea';

function port(state: LinkState, writable: boolean, answer = true) {
  return {
    state: vi.fn(() => state),
    writable: vi.fn(() => writable),
    symlink: vi.fn(),
    runAdmin: vi.fn(async () => {}),
    confirm: vi.fn(async () => answer),
  } satisfies LinkPort;
}

describe('installCommand', () => {
  it('does nothing when the command already points at this app', async () => {
    const fs = port({ kind: 'link', to: TARGET }, true);
    expect(await installCommand(fs, TARGET, LINK)).toBe('installed');
    expect(fs.confirm).not.toHaveBeenCalled();
    expect(fs.symlink).not.toHaveBeenCalled();
  });

  it('asks first, then links where the folder is writable', async () => {
    const fs = port({ kind: 'missing' }, true);
    expect(await installCommand(fs, TARGET, LINK)).toBe('installed');
    expect(fs.confirm).toHaveBeenCalledWith('install');
    expect(fs.symlink).toHaveBeenCalledWith(TARGET, LINK);
    expect(fs.runAdmin).not.toHaveBeenCalled();
  });

  it('asks macOS for an administrator when /usr/local/bin is not writable', async () => {
    const fs = port({ kind: 'missing' }, false);
    expect(await installCommand(fs, TARGET, LINK)).toBe('installed');
    expect(fs.symlink).not.toHaveBeenCalled();
    expect(fs.runAdmin).toHaveBeenCalledWith(adminScript(TARGET, LINK));
  });

  it('says it replaces another otea before it does', async () => {
    const fs = port({ kind: 'link', to: '/old/Otea.app/Contents/Resources/bin/otea' }, true);
    await installCommand(fs, TARGET, LINK);
    expect(fs.confirm).toHaveBeenCalledWith('replace');
    const file = port({ kind: 'file' }, true);
    await installCommand(file, TARGET, LINK);
    expect(file.confirm).toHaveBeenCalledWith('replace');
  });

  it('leaves everything as it was when the person says no', async () => {
    const fs = port({ kind: 'missing' }, false, false);
    expect(await installCommand(fs, TARGET, LINK)).toBe('cancelled');
    expect(fs.symlink).not.toHaveBeenCalled();
    expect(fs.runAdmin).not.toHaveBeenCalled();
  });
});

describe('adminScript', () => {
  it('quotes the paths for the shell and for AppleScript', () => {
    expect(adminScript('/Apps/O\'tea "x".app/otea', LINK)).toBe(
      `do shell script "mkdir -p '/usr/local/bin' && ln -sf '/Apps/O'\\\\''tea \\"x\\".app/otea' '/usr/local/bin/otea'" with administrator privileges`,
    );
  });
});
