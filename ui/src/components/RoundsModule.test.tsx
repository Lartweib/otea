import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ago, officialType } from '../derive/fixtures.ts';
import { setLanguage } from '../i18n/i18n.ts';
import type { ItemEvent, ItemView } from '../types.ts';
import { RoundsModule } from './RoundsModule.tsx';

const bug = officialType('bug-triage');
const fresh: ItemView = {
  id: 'ERR-2',
  collection: 'Errores',
  type: bug.name,
  title: 'La niebla parpadea',
  fields: {},
  presetVersion: 1,
  state: 'reported',
  turn: 'human',
  createdAt: ago(10),
  updatedAt: ago(10),
  createdBy: { kind: 'agent', name: 'Scout' },
  lease: null,
  events: [],
  transitions: [],
  relayable: [],
  missing: [],
  evidence: [],
  relations: [],
};
const render = (quiet?: boolean) =>
  renderToStaticMarkup(
    <RoundsModule
      item={fresh}
      type={bug}
      entry={{ module: 'rounds' }}
      canWrite
      {...(quiet ? { quiet } : {})}
    />,
  );

describe('RoundsModule', () => {
  it('says there are no rounds yet, unless a board already draws its round notes (quiet)', () => {
    expect(render()).toContain('rd-none');
    expect(render(true)).toBe('');
  });
});

afterEach(() => setLanguage('en'));

const scout = { kind: 'agent' as const, name: 'scout' };
const you = { kind: 'human' as const, name: 'human' };
let ids = 0;
const moved = (at: string, actor: ItemEvent['actor'], from: string, to: string): ItemEvent => ({
  id: ++ids,
  type: 'transitioned',
  actor,
  at: `2026-11-12T${at}:00.000Z`,
  data: { from, to, reason: 'x' },
});
// Two rounds: the first sent back, the second approved into a closing state.
const fixed: ItemView = {
  ...fresh,
  state: 'fixed',
  turn: 'none',
  events: [
    moved('20:10', scout, 'accepted', 'fixing'),
    moved('20:20', scout, 'fixing', 'verify'),
    moved('20:28', you, 'verify', 'fixing'),
    moved('20:30', scout, 'fixing', 'verify'),
    moved('20:35', you, 'verify', 'fixed'),
  ],
};
const renderFixed = () =>
  renderToStaticMarkup(
    <RoundsModule item={fixed} type={bug} entry={{ module: 'rounds' }} canWrite />,
  );

describe('the rounds’ route', () => {
  it('names the state a round closed in with the preset’s word for the language on screen', () => {
    setLanguage('es');
    const html = renderFixed();
    expect(html).toContain('Arreglado');
    expect(html).not.toMatch(/>fixed</);
  });

  it('stacks each label under its node in lines narrower than the gap between nodes', () => {
    setLanguage('es');
    const html = renderFixed();
    const labels = html.match(/<span class="rd-label"[^>]*>.*?<\/span><\/span>/g) ?? [];
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      // the round, when it was handed in, and the verdict: each on its own line
      expect(label.match(/\brd-line\b/g)).toHaveLength(2);
      expect(label).toMatch(/title="[^"]+"/);
    }
  });
});
