import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ago, item } from '../derive/fixtures.ts';
import { setLanguage } from '../i18n/i18n.ts';
import type { ItemView, Move } from '../types.ts';
import { TriCard } from './Triage.tsx';

afterEach(() => setLanguage('en'));

const plan: Move = { to: 'splanit__doing', by: 'human', reasonRequired: false, turn: 'agent' };
const close: Move = {
  to: 'done',
  by: 'human',
  reasonRequired: false,
  turn: 'none',
  closes: 'done',
};
const again: Move = { to: 'sdesign__doing', by: 'human', reasonRequired: true, turn: 'agent' };
const drop: Move = {
  to: 'dropped',
  by: 'human',
  reasonRequired: true,
  turn: 'none',
  closes: 'discarded',
};

const adr = item({ id: 'IDE-2', collection: 'Ideas', title: 'ADR: dónde se guardan los datos' });
const view = (transitions: Move[], more: object = {}): ItemView => ({
  ...adr,
  state: 'sdesign__review',
  events: [],
  transitions,
  relayable: [],
  missing: [],
  evidence: [],
  relations: [],
  createdAt: ago(60),
  ...more,
});
const words: Record<string, string> = {
  splanit__doing: 'Planificar',
  done: 'Hecho',
  sdesign__doing: 'Diseñar',
  dropped: 'Descartado',
};

const card = (transitions: Move[], more: object = {}) =>
  renderToStaticMarkup(
    <TriCard
      item={adr}
      under={false}
      view={view(transitions, more)}
      round={{ figures: [], fields: [], files: [], gate: undefined, pending: false }}
      words={{ agent: 'Mender', say: '', round: 1 }}
      state="Diseñar"
      phone
      wordOf={(state) => words[state] ?? state}
      register={() => undefined}
      onDecide={() => undefined}
      onOpen={() => undefined}
    />,
  );

// A Decisión at Diseñar offered only «Aprobar → Planificar» in Triage; its page also had «Mover a
// Hecho» (P7-R3-2).
describe('the moves a Triage card offers', () => {
  it('offers the item page’s other moves beside Aprobar and Devolver', () => {
    setLanguage('es');
    const html = card([plan, close, again, drop]);
    expect(html).toContain('data-side="right"');
    expect(html).toMatch(/<span class="to">a Planificar<\/span>/);
    const acts = html.slice(html.indexOf('class="tc-acts"'));
    expect(acts).toMatch(
      />Aprobar<\/button>.*>Devolver…<\/button><button[^>]*data-move="done"[^>]*>Mover a Hecho<\/button>/,
    );
    // Discarding stays on the item's page, as there.
    expect(html).not.toContain('data-move="dropped"');
  });

  it('offers no other move where the page has none', () => {
    expect(card([plan, again])).not.toContain('data-move=');
  });

  // While the board a Pedido drafts waits, its page offers no close as done: neither does the card.
  it('offers no close as done while the board a Pedido drafts waits', () => {
    setLanguage('es');
    const request = { board: 'b9', name: 'Gastos', arrived: true, instructions: '' };
    const waiting = card([close, again], { board: { request } });
    expect(waiting).not.toContain('data-side="right"');
    expect(waiting).not.toContain('data-move="done"');
    expect(waiting).toMatch(/<button[^>]*disabled=""[^>]*>Aprobar<\/button>/);
    expect(card([plan, close, again], { board: { request } })).not.toContain('data-move="done"');
    // Published, the board closed the Pedido: nothing is held back any more.
    const published = { ...request, published: true as const };
    expect(card([close, again], { board: { request: published } })).toContain('data-side="right"');
  });
});
