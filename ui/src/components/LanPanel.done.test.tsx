// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type App, AppTestProvider } from '../app/context.tsx';
import { setLanguage } from '../i18n/i18n.ts';
import type { Route } from '../selection.ts';
import { buttonNamed, type Mounted, mount, press } from '../test-dom.tsx';
import { LanPanel } from './LanPanel.tsx';

let page: Mounted | undefined;
afterEach(() => {
  page?.unmount();
  page = undefined;
  setLanguage('en');
});

const opened = (route: Route) => {
  const go = vi.fn();
  const app = { route, go, project: null } as unknown as App;
  page = mount(
    <AppTestProvider value={app}>
      <LanPanel canManage={false} />
    </AppTestProvider>,
  );
  return go;
};

// TS-14: opened from Configuración (reached from the sidebar too), Hecho went to Te toca: it goes
// back wherever the dialog was opened from, as closing it does.
describe('Emparejar un teléfono › Hecho', () => {
  it('goes back to Configuración when the dialog opened over it', async () => {
    setLanguage('es');
    const go = opened({ view: 'lan', over: 'settings' });
    await press(page && buttonNamed(page.root, 'Hecho'));
    expect(go).toHaveBeenCalledWith({ view: 'settings' });
  });

  it('goes back to Te toca when the dialog opened over it', async () => {
    setLanguage('es');
    const go = opened({ view: 'lan' });
    await press(page && buttonNamed(page.root, 'Hecho'));
    expect(go).toHaveBeenCalledWith({ view: 'toca' });
  });
});
