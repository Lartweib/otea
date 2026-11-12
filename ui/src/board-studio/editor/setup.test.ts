import { describe, expect, it } from 'vitest';
import { cambios, tareasDeRepo } from '../../../../src/core/board/testing.ts';
import { setDoer, toggleGuardPush } from './edits.ts';
import { needsSetup, setupItems, setupRows, startSetup, tick } from './setup.ts';

const pair = () => {
  const parent = cambios();
  const child = tareasDeRepo();
  parent.template = 'repos';
  child.template = 'repos';
  return { parent, child };
};

describe('Qué falta configurar', () => {
  it('asks who does each step of both boards, then when the branch is pushed and its repository', () => {
    const { parent, child } = pair();
    const items = setupItems({ parent, child });
    expect(items.map((i) => [i.role, i.what, i.ref])).toEqual([
      ['parent', 'doer', 'sanalyse'],
      ['parent', 'doer', 'sexec'],
      ['child', 'doer', 'sprop'],
      ['child', 'doer', 'simpl'],
      ['child', 'push', 'fbranch'],
      ['child', 'repo', 'frepo'],
    ]);
    expect(items.find((i) => i.what === 'push')?.sel).toEqual({ kind: 'form' });
    expect(items.find((i) => i.what === 'doer')?.sel).toEqual({ kind: 'step', id: 'sanalyse' });
  });

  it('ticks an item by itself when its setting changes, or when you say it is fine', () => {
    const defs = pair();
    const items = setupItems(defs);
    let store = startSetup(items, defs);
    expect(setupRows(items, defs, store).filter((r) => r.done)).toEqual([]);
    setDoer(defs.child, 'simpl', { agent: 'mender' });
    toggleGuardPush(defs.child, 'fbranch', 'sprop');
    store = tick(store, 'doer:parent:sanalyse');
    expect(
      setupRows(items, defs, store)
        .filter((r) => r.done)
        .map((r) => r.k),
    ).toEqual(['doer:parent:sanalyse', 'doer:child:simpl', 'push:child:fbranch']);
    store = tick(store, 'doer:parent:sanalyse');
    expect(setupRows(items, defs, store).filter((r) => r.done)).toHaveLength(2);
  });

  it('keys the store by board, so the same step id on both boards stays apart', () => {
    const defs = pair();
    const items = setupItems(defs);
    const store = tick(startSetup(items, defs), 'doer:parent:sanalyse');
    expect(setupRows(items, defs, store).find((r) => r.k === 'doer:parent:sanalyse')?.done).toBe(
      true,
    );
  });

  it('drops an item whose step or field is gone', () => {
    const defs = pair();
    const items = setupItems(defs);
    const store = startSetup(items, defs);
    defs.child.steps = defs.child.steps.filter((s) => s.id !== 'sprop');
    expect(setupRows(items, defs, store).map((r) => r.k)).not.toContain('doer:child:sprop');
  });

  it('is there only for boards a template set made, until the parent is published', () => {
    const defs = pair();
    expect(needsSetup(defs, { parentLive: false })).toBe(true);
    expect(needsSetup(defs, { parentLive: true })).toBe(false);
    defs.child.template = 'tasks';
    expect(needsSetup(defs, { parentLive: false })).toBe(false);
  });
});
