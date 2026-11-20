import { describe, expect, it } from 'vitest';

describe('the app nav sheet', () => {
  it('is the shell’s nav flag, so the topbar button and the sheet share one state', async () => {
    const { navSheet } = await import('./nav.ts');
    const { shellUi } = await import('../shell/shell-ui.ts');
    shellUi.set({ nav: true });
    expect(navSheet.get()).toBe(true);
    navSheet.close();
    expect(shellUi.get().nav).toBe(false);
    navSheet.toggle();
    expect(shellUi.get().nav).toBe(true);
    navSheet.close();
  });
});
