import { describe, expect, it } from 'vitest';
import {
  dropRefusalText,
  handedText,
  NOT_TAKEN_BACK,
  nextText,
  parentRequiredText,
  refusalText,
  takenBackText,
} from '../../../../src/core/board/next.ts';
import { cambios, creatures, errores, tareasDeRepo } from '../../../../src/core/board/testing.ts';
import { agentView } from './agent.ts';

describe('agentView', () => {
  it('is exactly what next answers at the step, with the refusal of an empty handoff', () => {
    const def = creatures();
    const view = agentView(def, 'sanimate', 'doing');
    if (view.kind !== 'text') throw new Error(view.kind);
    expect(view.text).toBe(
      nextText(def, {
        id: 'CRI-12',
        title: 'Tortuga musgosa',
        position: { step: 'sanimate', phase: 'doing' },
        round: 1,
        fields: view.facts.fields,
        evidence: view.facts.evidence,
        missing: view.missing,
      }),
    );
    expect(view.text).toContain('✗ Animación: required, new this round (missing)');
    expect(view.after).toEqual({
      kind: 'refusal',
      text: refusalText('CRI-12', view.missing),
    });
    expect(view.after.text).toBe(
      'Not handed off CRI-12: missing Animación (new this round) and Comprobaciones.\n' +
        'Attach or fill them with otea attach CRI-12 / otea update CRI-12, then call handoff again.',
    );
  });

  it('shows the line after the handoff when the step asks for nothing', () => {
    const def = creatures();
    const first = def.steps[0];
    if (!first) throw new Error('fixture');
    first.hand = [];
    const view = agentView(def, 'sconcept', 'doing');
    if (view.kind !== 'text') throw new Error(view.kind);
    expect(view.after).toEqual({
      kind: 'handed',
      text: handedText(def, 'CRI-12', { step: 'sconcept', phase: 'review' }),
    });
  });

  it('reads the agent reviewer’s review when the review is picked', () => {
    const view = agentView(creatures(), 'sanimate', 'review');
    if (view.kind !== 'text') throw new Error(view.kind);
    expect(view.phase).toBe('review');
    expect(view.text).toContain('Your turn: review this step (another agent did it).');
    expect(view.after.kind).toBe('handed');
  });

  it('says no agent receives a step you do and review yourself', () => {
    expect(agentView(creatures(), 'spolish', 'doing')).toEqual({
      kind: 'yours',
      step: 'spolish',
      backs: [],
    });
    const empty = creatures();
    empty.steps = [];
    expect(agentView(empty, undefined, 'doing')).toEqual({ kind: 'none' });
  });
});

describe('agentView: the new capabilities', () => {
  it('passes the parts, what blocks it and the board they are on to next, and words every refusal', () => {
    const def = errores();
    const view = agentView(def, 'sfix', 'doing');
    if (view.kind !== 'text') throw new Error(view.kind);
    expect(view.text).toContain('✗ Note: required (la prueba)');
    expect(view.text).toContain('Parts');
    expect(view.text).toContain('Branch');
    expect(view.text).toContain('otea drop BUG-12 --reason "why"');
    expect(view.answers.map(({ label }) => label)).toEqual([
      'ifEmpty',
      'ifPartsOpen',
      'ifReopened',
      'ifBlocked',
      'ifTakenBack',
      'ifDrops',
      'ifBranch',
    ]);
    const empty = view.answers[0]?.runs[0];
    expect(empty?.text).toBe(
      'Not handed off BUG-12: missing Cambios de código and a note.\n' +
        'Attach or fill them with otea attach BUG-12 / otea update BUG-12, then call handoff again with --note "<la prueba>".',
    );
    expect(view.answers[1]?.runs[0]?.command).toBe('otea handoff BUG-12 --note "la prueba"');
    expect(view.answers[1]?.runs[0]?.text).toMatch(/^Not handed off BUG-12: /);
    expect(view.answers[4]?.runs.map(({ text }) => text)).toEqual([
      NOT_TAKEN_BACK,
      takenBackText(def, 'BUG-12', 'striage', 2),
    ]);
    expect(view.answers[5]?.runs[0]?.text).toBe(dropRefusalText(def, 'BUG-12', 'motive_required'));
    expect(view.answers[6]?.runs.map(({ command }) => command)).toEqual([
      'git push, while Arreglar is being done',
      'git push, while it is reviewed',
      'git merge, before Done',
    ]);
  });

  it('shows the skip at creation on a first step that skips', () => {
    const view = agentView(errores(), 'sfill', 'doing');
    if (view.kind !== 'text') throw new Error(view.kind);
    const create = view.answers.find(({ label }) => label === 'onCreate');
    expect(create?.runs.map(({ text }) => text)).toEqual([
      'Created BUG-13 in Triar: it already had everything Completar asks for.',
      'Created BUG-14 in Completar: missing Pasos. Fill them, then otea handoff BUG-14.',
    ]);
  });

  it('reads a pair: the parent counts its parts on the child board; the child refuses a part created alone', () => {
    const parent = cambios();
    const child = tareasDeRepo();
    const view = agentView(parent, 'sexec', 'doing', { child });
    if (view.kind !== 'text') throw new Error(view.kind);
    expect(view.text).toContain('Tareas de repo: 1 of 3 finished');
    expect(view.text).toContain('otea create --collection "Tareas de repo" --parent CAM-12');
    expect(view.answers.map(({ label }) => label)).toEqual([
      'ifPartsOpen',
      'ifReopened',
      'ifOtherPart',
    ]);
    const kid = agentView(child, 'simpl', 'doing', { parent: { def: parent, always: true } });
    if (kid.kind !== 'text') throw new Error(kid.kind);
    expect(kid.answers.find(({ label }) => label === 'ifNoParent')?.runs[0]?.text).toBe(
      parentRequiredText(child, parent),
    );
  });
});
