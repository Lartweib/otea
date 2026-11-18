import { describe, expect, it } from 'vitest';
import type { ItemView, Layout, TypeView } from '../../types.ts';
import { bodySections } from './Body.tsx';
import type { Facts } from './facts.ts';

const EMPTY: Layout = {
  header: [],
  evidence: [],
  body: [],
  side: [],
  row: [],
  phone: [],
  intake: [],
};

// A board's type as Studio compiles it: Rondas first in the main column, then the deliverable.
const type = {
  name: 'change',
  label: 'Change',
  initial: 'sdo',
  states: [],
  fields: [{ name: 'title', module: 'text', required: 'create' }],
  layout: {
    ...EMPTY,
    body: [{ module: 'rounds' }, { id: 'pdiff', module: 'diff', label: 'Diff' }],
  },
} as unknown as TypeView;

const item = {
  id: 'CHA-1',
  collection: 'Changes',
  type: 'change',
  state: 'sdo__review',
  turn: 'human',
  fields: { title: 'Fix the header' },
  evidence: [],
  events: [],
} as unknown as ItemView;

describe('the item page body', () => {
  it('shows the deliverable before the rounds', () => {
    const keys = bodySections({
      item,
      type,
      facts: {} as Facts,
      canWrite: false,
      now: 0,
    }).map(({ key }) => key);

    const deliverable = keys.indexOf('evidence');
    const rounds = keys.findIndex((key) => key.startsWith('r:rounds'));
    expect(deliverable).toBeGreaterThanOrEqual(0);
    expect(rounds).toBeGreaterThan(deliverable);
  });
});
