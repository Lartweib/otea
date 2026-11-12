import { describe, expect, it } from 'vitest';
import { cambios, creatures, errores, tareasDeRepo } from '../../../../src/core/board/testing.ts';
import {
  act,
  addPart,
  approvePractice,
  createFilled,
  dropPractice,
  fillPart,
  focusOn,
  handOff,
  itemAt,
  type PracticeRun,
  type PracticeState,
  pickWay,
  practiceView,
  quickAction,
  quickStep,
  reopenPart,
  restartPractice,
  restartRun,
  runParts,
  sendBackPractice,
  simulate,
  startPractice,
  startRun,
  takeBack,
  tryGate,
  writeNote,
} from './practice.ts';

function start(): PracticeState {
  const state = startPractice(creatures());
  if (!state) throw new Error('no steps');
  return state;
}

const at = (s: PracticeState) => {
  const v = practiceView(s);
  return v.closed ? 'done' : `${v.step}:${v.phase}:${v.round}`;
};

describe('practice', () => {
  it('cannot start on a board with no steps', () => {
    const def = creatures();
    def.steps = [];
    expect(startPractice(def)).toBeNull();
  });

  it('refuses an empty handoff, then hands off once the step has what it asks for', () => {
    let s = start();
    expect(at(s)).toBe('sconcept:doing:1');
    expect(s.log).toEqual([{ kind: 'created', id: 'CRI-1', step: 'Concepto' }]);
    s = handOff(s);
    expect(at(s)).toBe('sconcept:doing:1');
    expect(s.said).toEqual({ kind: 'refused', missing: ['Arte conceptual'] });
    expect(s.log.at(-1)).toEqual({
      kind: 'refused',
      by: 'agent',
      who: null,
      missing: ['Arte conceptual'],
    });
    s = fillPart(s, 'eart');
    expect(practiceView(s).checklist.find(({ ref }) => ref === 'eart')?.ok).toBe(true);
    s = handOff(s);
    expect(at(s)).toBe('sconcept:review:1');
    expect(practiceView(s).actor).toBe('you');
  });

  it('asks for a note to send back; round 2 dips on the route and empties what is new each round', () => {
    let s = handOff(fillPart(start(), 'eart'));
    const silent = sendBackPractice(s, '  ');
    expect(silent.said).toEqual({ kind: 'note' });
    expect(at(silent)).toBe('sconcept:review:1');
    s = sendBackPractice(s, 'Más contraste');
    expect(at(s)).toBe('sconcept:doing:2');
    expect(s.said).toEqual({ kind: 'back', step: 'Concepto', round: 2, fresh: true });
    expect(practiceView(s).dips).toEqual([
      { from: 'sconcept', to: 'sconcept', at: expect.any(String) },
    ]);
    expect(practiceView(s).checklist.find(({ ref }) => ref === 'eart')?.ok).toBe(false);
    expect(s.log.at(-1)).toEqual({
      kind: 'sentBack',
      step: 'Concepto',
      note: 'Más contraste',
      to: 'Concepto',
      round: 2,
    });
  });

  it('walks the whole board: an agent reviewer’s other round, ways, Hecho', () => {
    let s = handOff(fillPart(start(), 'eart'));
    expect(practiceView(s).ways).toEqual(['sanimate', 'done']);
    s = approvePractice(s);
    expect(at(s)).toBe('sanimate:doing:1');
    expect(practiceView(s)).toMatchObject({ actor: 'agent', agent: 'kiln' });
    s = handOff(fillPart(fillPart(s, 'eanim'), 'fsteps'));
    expect(at(s)).toBe('sanimate:review:1');
    expect(practiceView(s)).toMatchObject({ actor: 'reviewer', agent: 'scout' });
    s = sendBackPractice(s, '');
    expect(at(s)).toBe('sconcept:doing:2');
    expect(s.log.at(-1)).toMatchObject({ kind: 'again', who: 'scout', step: 'Animar' });
    s = approvePractice(handOff(fillPart(s, 'eart')));
    s = approvePractice(handOff(fillPart(s, 'eanim')));
    expect(at(s)).toBe('spolish:doing:1');
    s = handOff(s);
    expect(at(s)).toBe('done');
    expect(s.log.at(-1)).toEqual({ kind: 'done', id: 'CRI-1' });
  });

  it('approves along the way picked', () => {
    let s = handOff(fillPart(start(), 'eart'));
    s = approvePractice(pickWay(s, 'done'));
    expect(at(s)).toBe('done');
    expect(s.log.at(-2)).toEqual({
      kind: 'approved',
      by: 'you',
      who: null,
      step: 'Concepto',
      to: 'done',
    });
  });

  it('starts again from the first step', () => {
    const s = restartPractice(handOff(fillPart(start(), 'eart')));
    expect(at(s)).toBe('sconcept:doing:1');
    expect(s.log).toEqual([{ kind: 'created', id: 'CRI-1', step: 'Concepto', again: true }]);
  });
});

describe('practice: the new capabilities', () => {
  const bugs = () => {
    const state = startPractice(errores());
    if (!state) throw new Error('no steps');
    return state;
  };
  // Errores at Arreglar (the third step), doing.
  const atFix = () => handOff(fillPart(createFilled(bugs()), 'fcat'));

  it('creates an item with everything filled past a first step that skips it', () => {
    const s = createFilled(bugs());
    expect(at(s)).toBe('striage:doing:1');
    expect(s.said).toEqual({ kind: 'skipped', step: 'Triar', first: 'Completar' });
    expect(s.log).toEqual([
      { kind: 'created', id: 'BUG-1', step: 'Completar', filled: true },
      { kind: 'skipped', id: 'BUG-1', step: 'Triar', first: 'Completar' },
    ]);
    expect(practiceView(s).canSkip).toBe(false);
    expect(practiceView(bugs()).canSkip).toBe(true);
  });

  it('takes an item back to an earlier step only with a reason, and that step starts its next round', () => {
    const s = createFilled(bugs());
    expect(practiceView(s).backs).toEqual(['sfill']);
    const silent = takeBack(s, 'sfill', ' ');
    expect(silent.said).toEqual({ kind: 'reason', you: true });
    expect(at(silent)).toBe('striage:doing:1');
    const back = takeBack(s, 'sfill', 'Faltan los pasos');
    // As the server counts it: the item was created at Triar, so Completar starts its first round.
    expect(at(back)).toBe('sfill:doing:1');
    expect(back.said).toEqual({ kind: 'tookBack', you: true, step: 'Completar', round: 1 });
    expect(back.log.at(-1)).toEqual({
      kind: 'tookBack',
      by: 'you',
      who: null,
      id: 'BUG-1',
      to: 'Completar',
      reason: 'Faltan los pasos',
    });
  });

  it('counts a skipped creation as the first round of the step it starts at', () => {
    const back = takeBack(atFix(), 'striage', 'No se arregla ahora');
    expect(at(back)).toBe('striage:doing:2');
    expect(back.said).toEqual({ kind: 'tookBack', you: false, step: 'Triar', round: 2 });
  });

  it('refuses a handoff without its note, then hands off with one and keeps it', () => {
    let s = simulate(simulate(fillPart(atFix(), 'ecode'), 'parts'), 'blocker');
    expect(at(s)).toBe('sfix:doing:1');
    expect(practiceView(s).note).toEqual({ req: 'always', hint: 'la prueba' });
    const refused = handOff(s);
    expect(refused.said).toEqual({ kind: 'refused', missing: [], note: true });
    expect(refused.log.at(-1)).toMatchObject({
      kind: 'refused',
      by: 'agent',
      who: 'mender',
      note: true,
    });
    s = handOff(writeNote(s, 'Probé el faro al anochecer.'));
    expect(at(s)).toBe('sfix:review:1');
    expect(s.lastNote).toBe('Probé el faro al anochecer.');
    expect(s.log.at(-1)).toMatchObject({ kind: 'handed', note: 'Probé el faro al anochecer.' });
  });

  it('waits for its sample parts, then for what blocks it, until they are simulated to finish', () => {
    let s = writeNote(fillPart(atFix(), 'ecode'), 'ok');
    expect(practiceView(s).waits).toEqual([
      expect.objectContaining({ wait: 'parts', total: 3, simulated: true }),
      expect.objectContaining({ wait: 'blockers' }),
    ]);
    s = handOff(s);
    expect(s.said).toMatchObject({ kind: 'waited', wait: 'parts', total: 3 });
    expect(s.said?.kind === 'waited' && s.said.open.map(({ id }) => id)).toEqual([
      'BUG-4',
      'BUG-7',
    ]);
    s = handOff(simulate(s, 'parts'));
    expect(s.said).toMatchObject({ kind: 'waited', wait: 'blockers' });
    s = handOff(simulate(s, 'blocker'));
    expect(at(s)).toBe('sfix:review:1');
    const reopened = approvePractice(simulate(s, 'reopen'));
    expect(reopened.said).toMatchObject({ kind: 'approvalRefused' });
    expect(at(reopened)).toBe('sfix:review:1');
    expect(at(approvePractice(reopened))).toBe('done');
  });

  it('discards only with a motive and a reason, as you or as the step’s agent', () => {
    const s = atFix();
    expect(practiceView(s).dropsAs).toBe('agent');
    expect(dropPractice(s, null, 'ya está').said).toEqual({
      kind: 'dropRefused',
      why: 'motive',
      agent: true,
      motives: ['Rechazado', 'Duplicado'],
    });
    expect(dropPractice(s, 'duplicate', ' ').said).toMatchObject({ why: 'reason' });
    const dropped = dropPractice(s, 'duplicate', 'Igual que BUG-3');
    expect(dropped.position).toEqual({ closed: 'dropped', motive: 'duplicate' });
    expect(dropped.log.at(-1)).toEqual({
      kind: 'dropped',
      by: 'agent',
      who: 'mender',
      id: 'BUG-1',
      motive: 'Duplicado',
      reason: 'Igual que BUG-3',
    });
    expect(practiceView(createFilled(bugs())).dropsAs).toBe('you');
  });

  it('answers Subir cambios and Fusionar where the item stands', () => {
    const s = atFix();
    expect(practiceView(s).guarded).toBe(true);
    expect(tryGate(s, 'push').gate).toEqual({
      action: 'push',
      answer: { allowed: true, why: 'doing' },
    });
    expect(tryGate(s, 'merge').gate?.answer).toEqual({ allowed: false, why: 'not_done' });
    expect(tryGate(createFilled(bugs()), 'push').gate?.answer.why).toBe('not_push_step');
  });
});

describe('practice: a pair', () => {
  const run = (onChild = false) => {
    const started = startRun(cambios(), tareasDeRepo(), onChild);
    if (!started) throw new Error('no steps');
    return started;
  };
  const focused = (r: PracticeRun) => {
    const item = itemAt(r);
    if (!item) throw new Error('no item');
    return item;
  };
  const withChild = (child: Parameters<Parameters<typeof act>[1]>[1]) => (child ? { child } : {});
  // CAM-1 at Ejecutar, doing.
  const atExecute = (r: PracticeRun) =>
    act(
      act(r, (s) => handOff(fillPart(s, 'fplan'))),
      (s) => approvePractice(s),
    );

  it('starts on the parent’s item, or from the child’s tab on its first part', () => {
    expect(run().items.map(({ id }) => id)).toEqual(['CAM-1']);
    const fromChild = run(true);
    expect(fromChild.items.map(({ id, parent }) => `${id}:${parent}`)).toEqual([
      'CAM-1:null',
      'TAR-1:CAM-1',
    ]);
    expect(fromChild.focus).toBe(1);
    expect(fromChild.log.at(-1)).toEqual({
      id: 'TAR-1',
      entry: { kind: 'created', id: 'TAR-1', step: 'Propuesta', parent: 'CAM-1' },
    });
  });

  it('refuses Ejecutar while its parts are open, hands off once they finish, and a reopened part stops the approval', () => {
    let r = addPart(addPart(atExecute(run())));
    expect(focused(r).position).toEqual({ step: 'sexec', phase: 'doing' });
    expect(r.items.map(({ id }) => id)).toEqual(['CAM-1', 'TAR-1', 'TAR-2']);
    r = act(r, (s, child) => handOff(s, withChild(child)));
    const said = focused(r).said;
    expect(said).toMatchObject({
      kind: 'waited',
      wait: 'parts',
      total: 2,
      label: 'Tareas de repo',
    });
    expect(said?.kind === 'waited' && said.open.map(({ id, step }) => `${id} (${step})`)).toEqual([
      'TAR-1 (Propuesta)',
      'TAR-2 (Propuesta)',
    ]);
    for (const k of [1, 2]) {
      expect(quickAction(r.items[k] as PracticeState)).toEqual({
        kind: 'handOff',
        agent: null,
        you: true,
      });
      r = quickStep(r, k); // Propuesta → Implementar
      expect(r.log.at(-1)?.entry).toMatchObject({ kind: 'handed', quick: true, filled: true });
      r = quickStep(r, k); // Implementar handed off
      r = quickStep(r, k); // approved → Hecho
    }
    expect(runParts(r)).toEqual({ total: 2, done: 2 });
    expect(practiceView(focused(r), tareasDeRepo()).waits[0]).toMatchObject({ open: [], total: 2 });
    r = act(r, (s, child) => handOff(s, withChild(child)));
    expect(focused(r).position).toEqual({ step: 'sexec', phase: 'review' });
    r = reopenPart(r, 1);
    r = act(r, (s, child) => approvePractice(s, withChild(child)));
    expect(focused(r).said).toMatchObject({ kind: 'approvalRefused', open: [{ id: 'TAR-1' }] });
    r = quickStep(quickStep(r, 1), 1);
    r = act(r, (s, child) => approvePractice(s, withChild(child)));
    expect(focused(r).position).toEqual({ closed: 'done' });
    expect(r.log.at(-1)).toEqual({ id: 'CAM-1', entry: { kind: 'done', id: 'CAM-1' } });
  });

  it('drops the parent’s refusal once a part moves, so it never reads stale', () => {
    let r = addPart(atExecute(run()));
    r = act(r, (s, child) => handOff(s, withChild(child)));
    expect(focused(r).said).toMatchObject({ kind: 'waited' });
    r = quickStep(r, 1);
    expect(r.items[0]?.said).toBeNull();
  });

  it('plays a part in full from its focus', () => {
    let r = focusOn(addPart(run()), 1);
    r = act(r, (s) => handOff(fillPart(s, 'fwhat')));
    expect(focused(r).position).toEqual({ step: 'simpl', phase: 'doing' });
    expect(focused(r).parent).toBe('CAM-1');
    expect(tryGate(focused(r), 'push').gate?.answer.allowed).toBe(true);
  });

  it('starts again with no parts', () => {
    const r = restartRun(addPart(run()));
    expect(r.items.map(({ id }) => id)).toEqual(['CAM-1']);
    expect(r.log).toEqual([
      { id: 'CAM-1', entry: { kind: 'created', id: 'CAM-1', step: 'Analizar', again: true } },
    ]);
  });
});
