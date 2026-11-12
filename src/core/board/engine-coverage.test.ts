import { describe, expect, it } from 'vitest';
import {
  approve,
  backWaysOf,
  drop,
  gateAt,
  handoff,
  handoffCheck,
  type ItemFacts,
  initialPosition,
  type Linked,
  NOTE_REF,
  positionOf,
  refusalCode,
  roundsOf,
  stateOf,
  WAIT_BLOCKERS,
  WAIT_PARTS,
  waysOf,
} from './engine.ts';
import type { Step } from './model.ts';
import { creatures, errores } from './testing.ts';

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 12, 10, minutes)).toISOString();
const kiln = { kind: 'agent' as const, name: 'kiln' };
const mender = { kind: 'agent' as const, name: 'mender' };
const you = { kind: 'human' as const, name: 'fede' };

const facts = (more: Partial<ItemFacts> = {}): ItemFacts => ({
  fields: { fsteps: 'abrir, ir', fcat: 'cgame' },
  evidence: [{ part: 'ecode', at: at(1) }],
  ...more,
});

const open = (id: string, stepName = 'Implementar'): Linked => ({
  id,
  board: 'Tareas de repo',
  step: stepName,
  closed: false,
});
const closed = (id: string): Linked => ({ id, board: 'Tareas de repo', closed: true });

const fixing = { step: 'sfix', phase: 'doing' as const };

describe('ways back', () => {
  it('keeps forward ways and ways back apart, each in row order', () => {
    const def = errores();
    expect(waysOf(def, 'striage')).toEqual(['sfix']);
    expect(backWaysOf(def, 'striage')).toEqual(['sfill']);
    expect(backWaysOf(def, 'sfix')).toEqual(['striage']);
    expect(backWaysOf(def, 'sfill')).toEqual([]);
  });

  it('takes the item back with a reason, skipping the review and the Entrega', () => {
    const def = errores();
    const bare: ItemFacts = { fields: {}, evidence: [] };
    expect(handoff(def, fixing, bare, { by: mender, way: 'striage' })).toEqual({
      ok: false,
      code: 'reason_required',
    });
    expect(
      handoff(def, fixing, bare, { by: mender, way: 'striage', reason: 'no es un bug' }),
    ).toEqual({ ok: true, to: { step: 'striage', phase: 'doing' }, back: true });
  });

  it('lets the person give their own step back (Devolver a Completar), with a note', () => {
    const def = errores();
    const triage = { step: 'striage', phase: 'doing' as const };
    expect(
      handoff(def, triage, facts(), { by: you, way: 'sfill', reason: '¿Qué versión?' }),
    ).toEqual({ ok: true, to: { step: 'sfill', phase: 'doing' }, back: true });
  });

  it('counts a way back as the next round of the earlier step, and a dip', () => {
    const def = errores();
    const rounds = roundsOf(def, 'sfill', at(0), [
      { from: 'sfill', to: 'striage', at: at(1) },
      { from: 'striage', to: 'sfix', at: at(2) },
      { from: 'sfix', to: 'striage', at: at(3) },
    ]);
    expect(rounds.rounds).toEqual({ sfill: 1, striage: 2, sfix: 1 });
    expect(rounds.dips).toEqual([{ from: 'sfix', to: 'striage', at: at(3) }]);
  });
});

describe('the note of a handoff', () => {
  it('is missing until the handoff carries one, after the parts', () => {
    const def = errores();
    const check = handoffCheck(def, 'sfix', facts({ fields: {}, evidence: [] }));
    expect(check.missing.map(({ ref }) => ref)).toEqual(['ecode', NOTE_REF]);
    expect(check.missing[1]).toMatchObject({ reason: 'missing', hint: 'la prueba' });
    expect(handoffCheck(def, 'sfix', facts({ note: '  ' })).ok).toBe(false);
    expect(handoffCheck(def, 'sfix', facts({ note: 'probado', parts: [], blockers: [] })).ok).toBe(
      true,
    );
  });
});

describe('waits', () => {
  it('refuses while a part or a blocker is open, and names them', () => {
    const def = errores();
    const check = handoffCheck(
      def,
      'sfix',
      facts({
        note: 'ok',
        parts: [open('RT-4'), closed('RT-5')],
        blockers: [open('BUG-9', 'Arreglar')],
      }),
    );
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual([
      expect.objectContaining({ ref: WAIT_PARTS, reason: 'open', open: [open('RT-4')], total: 2 }),
      expect.objectContaining({
        ref: WAIT_BLOCKERS,
        reason: 'open',
        open: [open('BUG-9', 'Arreglar')],
      }),
    ]);
    expect(refusalCode(check.missing)).toBe('children_open');
    expect(refusalCode(check.missing.slice(1))).toBe('blockers_open');
    expect(refusalCode(handoffCheck(def, 'sfix', facts()).missing)).toBe('missing_fields');
  });

  it('is checked again on approval: a part reopened during the review stops it', () => {
    const def = errores();
    const review = { step: 'sfix', phase: 'review' as const };
    expect(approve(def, review, undefined, facts({ parts: [open('RT-4')] }))).toEqual({
      ok: false,
      code: 'missing',
      missing: [expect.objectContaining({ ref: WAIT_PARTS })],
    });
    expect(approve(def, review, undefined, facts({ parts: [closed('RT-4')] }))).toEqual({
      ok: true,
      to: { closed: 'done' },
    });
    // Approval never asks for the note or the parts again: those went with the handoff.
    expect(approve(def, review, undefined, { fields: {}, evidence: [] }).ok).toBe(true);
  });
});

describe('skip on creation', () => {
  it('starts at the next step when the item arrives with everything the first step asks', () => {
    const def = errores();
    expect(initialPosition(def, facts())).toEqual({
      position: { step: 'striage', phase: 'doing' },
      skipped: true,
    });
    expect(initialPosition(def, { fields: {}, evidence: [] })).toEqual({
      position: { step: 'sfill', phase: 'doing' },
      skipped: false,
    });
  });

  it('never skips a first step somebody reviews', () => {
    const def = errores();
    def.steps[0] = { ...(def.steps[0] as Step), reviewer: 'you' };
    expect(initialPosition(def, facts()).skipped).toBe(false);
  });
});

describe('drop', () => {
  it('needs a reason and, with motives, one of them; lands in that motive', () => {
    const def = errores();
    const triage = { step: 'striage', phase: 'doing' as const };
    const page = { by: you, via: 'page' as const };
    expect(drop(def, triage, { ...page, motive: 'duplicate' })).toEqual({
      ok: false,
      code: 'reason_required',
    });
    expect(drop(def, triage, { ...page, reason: 'ya está' })).toEqual({
      ok: false,
      code: 'motive_required',
    });
    expect(drop(def, triage, { ...page, reason: 'ya está', motive: 'nope' })).toEqual({
      ok: false,
      code: 'motive_required',
    });
    const done = drop(def, triage, { ...page, reason: 'ya está', motive: 'duplicate' });
    expect(done).toEqual({ ok: true, to: { closed: 'dropped', motive: 'duplicate' } });
    expect(stateOf({ closed: 'dropped', motive: 'duplicate' })).toBe('dropped__duplicate');
    expect(positionOf('dropped__duplicate')).toEqual({ closed: 'dropped', motive: 'duplicate' });
  });

  it('lets an agent drop only while doing a step that allows it', () => {
    const def = errores();
    const reason = { reason: 'no vale la pena', motive: 'rejected' };
    expect(drop(def, fixing, { by: mender, via: 'agent', ...reason }).ok).toBe(true);
    expect(drop(def, fixing, { by: kiln, via: 'agent', ...reason })).toEqual({
      ok: false,
      code: 'not_droppable',
    });
    expect(
      drop(def, { step: 'sfix', phase: 'review' }, { by: mender, via: 'agent', ...reason }),
    ).toEqual({ ok: false, code: 'not_droppable' });
    expect(
      drop(def, { step: 'sfill', phase: 'doing' }, { by: kiln, via: 'agent', ...reason }),
    ).toEqual({ ok: false, code: 'not_droppable' });
  });

  it('refuses a relay when the person drops from the page only', () => {
    const def = errores();
    const reason = { reason: 'x', motive: 'rejected' };
    expect(drop(def, fixing, { by: you, via: 'relay', ...reason })).toEqual({
      ok: false,
      code: 'not_relayable',
    });
    def.drop = { ...def.drop, by: 'anyone' };
    expect(drop(def, fixing, { by: you, via: 'relay', ...reason }).ok).toBe(true);
    expect(drop(def, { closed: 'done' }, { by: you, via: 'page', ...reason })).toEqual({
      ok: false,
      code: 'not_open',
    });
  });

  it('drops to plain Descartado on a board without motives', () => {
    const def = errores();
    def.drop = { by: 'anyone', motives: [] };
    expect(drop(def, fixing, { by: you, via: 'page', reason: 'x' })).toEqual({
      ok: true,
      to: { closed: 'dropped' },
    });
  });
});

describe('gates on the protected branch', () => {
  it('allows a push only while a push step is being done, and a merge only at Hecho', () => {
    const def = errores();
    expect(gateAt(def, fixing, 'push')).toEqual({ allowed: true, why: 'doing' });
    expect(gateAt(def, { step: 'sfix', phase: 'review' }, 'push')).toEqual({
      allowed: false,
      why: 'review',
    });
    expect(gateAt(def, { step: 'striage', phase: 'doing' }, 'push')).toEqual({
      allowed: false,
      why: 'not_push_step',
    });
    expect(gateAt(def, { closed: 'done' }, 'push')).toEqual({ allowed: false, why: 'closed' });
    expect(gateAt(def, fixing, 'merge')).toEqual({ allowed: false, why: 'not_done' });
    expect(gateAt(def, { closed: 'done' }, 'merge')).toEqual({ allowed: true, why: 'done' });
    expect(gateAt(def, { closed: 'dropped' }, 'merge')).toEqual({
      allowed: false,
      why: 'not_done',
    });
  });

  it('gates nothing on a board whose branch is not protected', () => {
    const def = creatures();
    expect(gateAt(def, { step: 'sconcept', phase: 'review' }, 'push')).toEqual({
      allowed: true,
      why: 'unguarded',
    });
  });
});
