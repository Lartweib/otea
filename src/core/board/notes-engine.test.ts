import { describe, expect, it } from 'vitest';
import { deliverables, handoffCheck, NOTES_REF, refusalCode } from './engine.ts';
import { nextText, refusalText } from './next.ts';
import { creatures } from './testing.ts';

const at = '2026-11-13T13:00:00.000Z';

describe('notes from the person in the engine', () => {
  it('holds a handoff while a note of the round is unanswered, as a missing part (exit 8)', () => {
    const def = creatures();
    const facts = { fields: {}, evidence: [{ part: 'eart', at }], unanswered: [2, 3] };

    const check = handoffCheck(def, 'sconcept', facts);

    expect(check.ok).toBe(false);
    expect(check.missing).toEqual([
      { ref: NOTES_REF, name: NOTES_REF, reason: 'missing', fresh: false, notes: [2, 3] },
    ]);
    expect(refusalCode(check.missing)).toBe('missing_fields');
    expect(handoffCheck(def, 'sconcept', { ...facts, unanswered: [] }).ok).toBe(true);
  });

  it('refuses with the notes alone when nothing else is missing', () => {
    expect(
      refusalText('TAR-7', [
        { ref: NOTES_REF, name: NOTES_REF, reason: 'missing', fresh: false, notes: [3] },
      ]),
    ).toBe(
      'Not handed off TAR-7: note 3 from the person is unanswered.\nAnswer it first: otea reply TAR-7 --note 3 "<your short answer>"',
    );
  });

  it('refuses with what is missing first, then the notes', () => {
    const def = creatures();
    const check = handoffCheck(def, 'sconcept', { fields: {}, evidence: [], unanswered: [1] });
    expect(refusalText('CRI-1', check.missing)).toBe(
      [
        'Not handed off CRI-1: missing Arte conceptual (new this round).',
        'Attach or fill them with otea attach CRI-1 / otea update CRI-1, then call handoff again.',
        'Not handed off CRI-1: note 1 from the person is unanswered.',
        'Answer it first: otea reply CRI-1 --note 1 "<your short answer>"',
      ].join('\n'),
    );
  });

  it('counts the required deliverables in, never the handoff note', () => {
    const def = creatures();
    expect(deliverables(def, 'sconcept', { fields: {}, evidence: [] })).toEqual({ done: 0, of: 1 });
    expect(
      deliverables(def, 'sconcept', {
        fields: { fbiome: 'cswamp' },
        evidence: [{ part: 'eart', at }],
      }),
    ).toEqual({ done: 1, of: 2 });
    expect(
      deliverables(def, 'sanimate', {
        fields: { fsteps: ['cone', 'ctwo'] },
        evidence: [],
      }),
    ).toEqual({ done: 1, of: 2 });
  });

  it('gives next the notes of the round and a Handoff line for them', () => {
    const def = creatures();
    const text = nextText(def, {
      id: 'CRI-1',
      title: 'Tortuga',
      position: { step: 'sconcept', phase: 'doing' },
      round: 1,
      fields: {},
      evidence: { eart: 1 },
      missing: [{ ref: NOTES_REF, name: NOTES_REF, reason: 'missing', fresh: false, notes: [1] }],
      me: 'kiln',
      holder: { name: 'kiln', expiresAt: '2026-11-13T13:46:00.000Z' },
      notes: [
        {
          note: 1,
          text: '¿Y la cola?',
          at,
          by: 'fede',
          step: 'sconcept',
          stepName: 'Concepto',
          round: 1,
          delivered: { done: 1, of: 1 },
        },
      ],
    });
    const lines = text.split('\n');
    expect(lines.slice(0, 6)).toEqual([
      'CRI-1 · Criatura · Concepto, round 1',
      'Your turn: do this step.',
      'You hold it until 2026-11-13 13:46 UTC; otea heartbeat CRI-1 keeps it longer.',
      'Notes from the person: 1, 1 unanswered',
      '  1 · "¿Y la cola?"',
      '      unanswered: otea reply CRI-1 --note 1 "<your short answer>"',
    ]);
    expect(lines).toContain('  ✗ Notes from the person answered: required (note 1 is not)');
  });
});
