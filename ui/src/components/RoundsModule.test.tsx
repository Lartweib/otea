import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ago, officialType } from '../derive/fixtures.ts';
import type { ItemView } from '../types.ts';
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
