import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { AppTestProvider } from '../../app/context.tsx';
import { ago, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { testApp } from '../../shell/test-app.ts';
import type { CollectionView, ItemView } from '../../types.ts';
import { ItemSheet } from './ItemSheet.tsx';

// TS-31: offline, a paired phone opened an item it kept and lost the agent's question: it said the
// desk's «Ejecuta otea open», with no offline banner. The question stays, with what waits for the PC.

afterEach(() => setLanguage('en'));

const bug = officialType('bug-triage');
const errores = {
  name: 'Errores',
  prefix: 'ERR',
  preset: 'bug-triage',
  types: [bug],
} as unknown as CollectionView;

const asked: ItemView = {
  id: 'ERR-214',
  collection: 'Errores',
  type: bug.name,
  title: 'Los lobos no cruzan el puente',
  fields: { severity: 'high', category: 'gameplay' },
  presetVersion: 3,
  state: 'fixing',
  turn: 'human',
  asks: { question: 1, by: 'Scout', text: '¿Arreglo también el río?', at: ago(5) },
  createdAt: ago(900),
  updatedAt: ago(5),
  createdBy: { kind: 'agent', name: 'Scout' },
  lease: null,
  events: [],
  transitions: [],
  relayable: [],
  missing: [],
  evidence: [],
  relations: [],
};

const offline = (phone: boolean) =>
  testApp({
    collections: [errores],
    phone,
    session: { canWrite: false, canConfigure: false, canManageDevices: false },
    sync: { offline: true, syncedAt: Date.parse(ago(30)) },
  });

const render = (phone: boolean, item: ItemView = asked) =>
  renderToStaticMarkup(
    <AppTestProvider value={offline(phone)}>
      <ItemSheet
        item={item}
        full={false}
        nav={{ prev: false, next: false }}
        onNav={() => undefined}
        onFull={() => undefined}
        onClose={() => undefined}
      />
    </AppTestProvider>,
  );

describe('an item kept for offline', () => {
  it.each([
    ['on the phone', true],
    ['on the desk', false],
  ])('shows the question it kept, to answer once the PC is back, %s', (_, phone) => {
    setLanguage('es');
    const html = render(phone);
    expect(html).toContain('¿Arreglo también el río?');
    expect(html).toContain(
      'Sin conexión con tu equipo: podrás responder cuando vuelva a conectarse.',
    );
    expect(html).not.toContain('otea open');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enviar respuesta<\/button>/);
  });

  it('says why it cannot act, not the desk’s sign-in, on an item with no question', () => {
    setLanguage('en');
    const { asks: _, ...unasked } = asked;
    const html = render(true, unasked);
    expect(html).toContain('No connection to your computer: you can act once it is back.');
    expect(html).not.toContain('otea open');
  });

  // The phone's item page covers the line under the top bar: it carries its own.
  it('keeps the offline banner on the phone’s item page', () => {
    setLanguage('es');
    expect(render(true)).toContain('class="offline-bar"');
  });
});
