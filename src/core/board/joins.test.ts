import { describe, expect, it } from 'vitest';
import { joinsOf, parentJoinOf, partRule, requiredParent } from './joins.ts';
import { cambios, creatures, errores, tareasDeRepo } from './testing.ts';

const changes = { id: 'bcam', def: cambios() };
const repoTasks = { id: 'brt', def: tareasDeRepo() };
const bugs = { id: 'berr', def: errores() };
const plain = { id: 'bcri', def: creatures() };
const boards = [changes, repoTasks, bugs, plain];

describe('joins', () => {
  it('lists every split, its own parts included', () => {
    expect(
      joinsOf(boards).map(({ parent, child, always }) => `${parent.id}>${child.id}:${always}`),
    ).toEqual(['bcam>brt:true', 'berr>berr:false']);
    expect(parentJoinOf(boards, 'brt')?.parent.id).toBe('bcam');
    expect(parentJoinOf(boards, 'berr')).toBeUndefined();
  });

  it('allows parts only along the split, and plain parents only within a board', () => {
    expect(partRule(changes, repoTasks)).toBe('ok');
    expect(partRule(changes, bugs)).toBe('parent_type');
    expect(partRule(changes, changes)).toBe('parent_type');
    expect(partRule(bugs, bugs)).toBe('ok');
    expect(partRule(plain, plain)).toBe('ok');
    expect(partRule(plain, bugs)).toBe('across_boards');
  });

  it('asks a parent only of a board something always divides into', () => {
    expect(requiredParent(boards, 'brt')?.id).toBe('bcam');
    expect(requiredParent(boards, 'bcam')).toBeUndefined();
    expect(requiredParent(boards, 'berr')).toBeUndefined();
  });
});
