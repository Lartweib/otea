import { describe, expect, it } from 'vitest';
import { compileBoard } from './compile.ts';
import type { Part } from './model.ts';
import { errores } from './testing.ts';

const moves = (def = errores()) =>
  compileBoard('berr', 1, def).workflow.transitions.map(
    ({ from, to, by, reasonRequired }) => `${from}>${to}:${by}${reasonRequired ? '!' : ''}`,
  );

describe('compileBoard, the later settings', () => {
  it('lets the doer take an item back to an earlier step, with a reason', () => {
    const all = moves();
    expect(all).toContain('sfix>striage:agent!');
    // The person's own step gives it back (Devolver a Completar), with a note.
    expect(all).toContain('striage>sfill:human!');
  });

  it('asks a reason on the handoff of a step that wants a note', () => {
    const all = moves();
    expect(all).toContain('sfix>sfix__review:agent!');
    expect(all).toContain('sfill>striage:agent');
  });

  it('closes a discard in a state per motive, from the page only, besides plain Descartado', () => {
    const preset = compileBoard('berr', 1, errores());
    const states = preset.workflow.states.filter(({ turn }) => turn === 'none');
    expect(states.map(({ name, closes }) => `${name}:${closes}`)).toEqual([
      'done:done',
      'dropped:discarded',
      'dropped__rejected:discarded',
      'dropped__duplicate:discarded',
    ]);
    const all = moves();
    expect(all).toContain('striage>dropped__duplicate:human-ui!');
    expect(all).toContain('sfix__review>dropped__rejected:human-ui!');
    expect(all).not.toContain('striage>dropped__duplicate:human!');
    expect(preset.types[0]?.labels?.es?.states.dropped__duplicate).toBe('Duplicado');
  });

  it('lets an agent drop from the doing phase of a step that allows it, saying why', () => {
    const all = moves();
    expect(all).toContain('sfix>dropped__rejected:agent!');
    expect(all).not.toContain('sfill>dropped__rejected:agent!');
    const anyone = errores();
    anyone.drop = { by: 'anyone', motives: [] };
    expect(moves(anyone)).toContain('striage>dropped:human!');
  });

  it('gates the protected branch: push while its steps are done, merge at Hecho', () => {
    const { gates } = compileBoard('berr', 1, errores()).workflow;
    expect(gates).toEqual({ push: ['sfix'], merge: ['done'] });
  });

  it('gives a field its start value, and draws the list as a table grouped as asked', () => {
    const def = errores();
    def.parts.fcat = { ...(def.parts.fcat as Part), initial: 'cgame' };
    def.form = [{ ref: 'fcat', required: false }];
    def.row = ['fcat'];
    def.list = { as: 'table', group: 'fcat' };
    const preset = compileBoard('berr', 1, def);
    expect(preset.fields.fcat?.default).toBe('cgame');
    expect(preset.view).toEqual({
      kind: 'grid',
      groupBy: 'fcat',
      // The column it groups by is not repeated in every row.
      columns: ['id', 'title', 'state', 'who', 'age'],
    });
    def.list = { as: 'list', group: 'step' };
    expect(compileBoard('berr', 1, def).view.groupBy).toBe('state');
  });

  it('places the rounds and the parts where Acomodar put them', () => {
    const def = errores();
    def.layout = { rounds: 'main', parts: 'side' };
    def.split = { board: 'same', always: false };
    const layout = compileBoard('berr', 1, def).types[0]?.layout;
    expect(layout?.body).toContainEqual({ module: 'rounds' });
    expect(layout?.side).toContainEqual({ module: 'children' });
    // Without a split, there are no parts to place.
    delete def.split;
    expect(compileBoard('berr', 1, def).types[0]?.layout.side).not.toContainEqual({
      module: 'children',
    });
  });
});
