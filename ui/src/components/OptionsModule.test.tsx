import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ago } from '../derive/fixtures.ts';
import type { ItemView } from '../types.ts';
import { OptionsModule } from './OptionsModule.tsx';

const decision = {
  id: 'DEC-1',
  collection: 'Decisiones',
  type: 'item',
  title: 'Dónde guardar',
  fields: { fopts: '### A · SQLite\nLocal.\n\n### B · Nube\nSincroniza.' },
  state: 's1',
  turn: 'agent',
  createdAt: ago(5),
  updatedAt: ago(5),
  events: [],
} as unknown as ItemView;

const render = (sideBySide?: boolean) =>
  renderToStaticMarkup(
    <OptionsModule
      item={decision}
      entry={{ module: 'options' }}
      field="fopts"
      {...(sideBySide ? { sideBySide } : {})}
    />,
  );

describe('OptionsModule', () => {
  it('lays a Studio board’s options side by side, a decision’s one under another', () => {
    expect(render(true)).toContain('class="op-list side"');
    expect(render()).toContain('class="op-list"');
  });
});
