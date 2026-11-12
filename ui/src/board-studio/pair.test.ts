import { describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../../../src/core/board/model.ts';
import { cambios, creatures, errores, tareasDeRepo } from '../../../src/core/board/testing.ts';
import type { BoardSummary } from './api.ts';
import { madeWithOf, pairOf } from './pair.ts';

function summary(id: string, definition: BoardDefinition): BoardSummary {
  return {
    id,
    name: definition.name,
    item: definition.item,
    icon: definition.icon,
    builtin: false,
    status: 'draft',
    liveVersion: null,
    collection: null,
    open: 0,
    requestItem: null,
    definition,
  };
}

describe('pairOf', () => {
  const boards = [
    summary('bcam', cambios()),
    summary('brt', tareasDeRepo()),
    summary('berr', errores()),
    summary('bcri', creatures()),
  ];

  it('finds the joined pair from either board', () => {
    expect(pairOf(boards, 'bcam')).toEqual({ parent: 'bcam', child: 'brt', always: true });
    expect(pairOf(boards, 'brt')).toEqual({ parent: 'bcam', child: 'brt', always: true });
  });

  it('pairs nothing for a board that divides into its own items, or into nothing', () => {
    expect(pairOf(boards, 'berr')).toBeUndefined();
    expect(pairOf(boards, 'bcri')).toBeUndefined();
  });

  it('lists the boards a set made together that no split joins', () => {
    const tasks = { ...creatures(), name: 'Tareas', madeWith: ['berr'] };
    const bugs = { ...errores(), madeWith: ['btar'] };
    const made = [summary('btar', tasks), summary('berr', bugs), ...boards.slice(0, 2)];
    expect(madeWithOf(made, 'btar').map(({ id }) => id)).toEqual(['berr']);
    const pair = [
      summary('bcam', { ...cambios(), madeWith: ['brt'] }),
      summary('brt', { ...tareasDeRepo(), madeWith: ['bcam'] }),
    ];
    expect(madeWithOf(pair, 'bcam')).toEqual([]);
  });
});
