// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { buttonNamed, type Mounted, mount, press } from '../../test-dom.tsx';
import { TopicList } from './TopicsView.tsx';

// P6-R3-8: a search on the desk's Temas with no hit in this project said only that no topic
// mentioned it; what was concluded is often kept in another project, and nothing pointed there.

let page: Mounted | undefined;

beforeEach(() => setLanguage('es'));
afterEach(() => {
  page?.unmount();
  page = undefined;
  setLanguage('en');
});

describe('a topic search with no hit in this project', () => {
  it('offers to search every project', async () => {
    let wide = false;
    page = mount(
      <TopicList
        topics={[]}
        open={undefined}
        search="lobos"
        wide={false}
        onEverywhere={() => {
          wide = true;
        }}
      />,
    );
    expect(page.root.textContent).toContain('Ningún tema menciona «lobos».');
    await press(buttonNamed(page.root, 'Buscar en todos los proyectos'));
    expect(wide).toBe(true);
  });

  it('offers nothing more once it searched every project, or with nothing searched', () => {
    page = mount(
      <TopicList topics={[]} open={undefined} search="lobos" wide onEverywhere={() => undefined} />,
    );
    expect(buttonNamed(page.root, 'Buscar en todos los proyectos')).toBeUndefined();
    page.unmount();
    page = mount(
      <TopicList
        topics={[]}
        open={undefined}
        search=""
        wide={false}
        onEverywhere={() => undefined}
      />,
    );
    expect(buttonNamed(page.root, 'Buscar en todos los proyectos')).toBeUndefined();
  });
});
