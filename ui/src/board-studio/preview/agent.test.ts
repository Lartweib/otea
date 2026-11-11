import { describe, expect, it } from 'vitest';
import { handedText, nextText, refusalText } from '../../../../src/core/board/next.ts';
import { creatures } from '../../../../src/core/board/testing.ts';
import { agentView } from './agent.ts';

describe('agentView', () => {
  it('is exactly what next answers at the step, with the refusal of an empty handoff', () => {
    const def = creatures();
    const view = agentView(def, 'sanimate', 'doing');
    if (view.kind !== 'text') throw new Error(view.kind);
    expect(view.who).toBe('kiln');
    expect(view.text).toBe(
      nextText(def, {
        id: 'CRI-12',
        title: 'Tortuga musgosa',
        position: { step: 'sanimate', phase: 'doing' },
        round: 1,
        fields: view.facts.fields,
        evidence: view.facts.evidence,
        missing: view.missing,
        me: 'kiln',
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
    expect(view.who).toBeNull();
    expect(view.after).toEqual({
      kind: 'handed',
      text: handedText(def, 'CRI-12', { step: 'sconcept', phase: 'review' }),
    });
  });

  it('reads the agent reviewer’s review when the review is picked', () => {
    const view = agentView(creatures(), 'sanimate', 'review');
    if (view.kind !== 'text') throw new Error(view.kind);
    expect(view.phase).toBe('review');
    expect(view.who).toBe('scout');
    expect(view.text).toContain('Your turn: review this step (kiln did it).');
    expect(view.after.kind).toBe('handed');
  });

  it('says no agent receives a step you do and review yourself', () => {
    expect(agentView(creatures(), 'spolish', 'doing')).toEqual({ kind: 'yours', step: 'spolish' });
    const empty = creatures();
    empty.steps = [];
    expect(agentView(empty, undefined, 'doing')).toEqual({ kind: 'none' });
  });
});
