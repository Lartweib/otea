import { describe, expect, it, vi } from 'vitest';
import { makeShellUi } from './shell-ui.ts';

describe('the shell’s open surfaces', () => {
  it('starts with nothing open and tells its listeners of a change', () => {
    const ui = makeShellUi();
    const seen = vi.fn();
    ui.subscribe(seen);
    expect(ui.get()).toEqual({ nav: false, prefs: false });
    ui.set({ prefs: true });
    expect(ui.get()).toEqual({ nav: false, prefs: true });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('keeps quiet when nothing changes', () => {
    const ui = makeShellUi();
    const seen = vi.fn();
    ui.subscribe(seen);
    ui.set({ nav: false });
    expect(seen).not.toHaveBeenCalled();
  });
});
