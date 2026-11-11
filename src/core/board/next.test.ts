import { describe, expect, it } from 'vitest';
import { handedText, nextText, refusalText } from './next.ts';
import { creatures } from './testing.ts';

const def = creatures();

const base = {
  id: 'CRI-12',
  title: 'Tortuga musgosa',
  round: 1,
  fields: { fdesc: 'Una tortuga con musgo en el caparazón', fbiome: 'cswamp' },
  evidence: {},
};

describe('nextText', () => {
  it('says, word for word, what an agent doing a step reads', () => {
    const text = nextText(def, {
      ...base,
      position: { step: 'sconcept', phase: 'doing' },
      missing: [{ ref: 'eart', name: 'Arte conceptual', reason: 'missing', fresh: true }],
    });
    expect(text).toBe(
      [
        'CRI-12 · Criatura · Concepto, round 1',
        'Your turn: do this step.',
        '',
        'About this board',
        '  Cada criatura del pantano.',
        '',
        'Starts with',
        '  Título: Tortuga musgosa',
        '  Descripción: Una tortuga con musgo en el caparazón',
        '  Bioma: Pantano',
        '',
        'When you take it',
        '  Pinta desde la Descripción.',
        '',
        'Handoff',
        '  ✗ Arte conceptual: required, new this round (missing)',
        '      what goes here: 3 vistas',
        '  · Barro: required when Bioma is Pantano',
        '',
        'Before you hand it off',
        '  Adjunta el Arte conceptual.',
        '',
        'Next',
        '  Animar or Done: the person picks when approving it',
        '',
        'When you finish',
        '  otea handoff CRI-12',
      ].join('\n'),
    );
  });

  it('tells an agent reviewer how to approve or ask for another round', () => {
    const text = nextText(def, {
      ...base,
      round: 2,
      position: { step: 'sanimate', phase: 'review' },
      missing: [],
      evidence: { eart: 2, eanim: 1 },
      me: 'scout',
    });
    expect(text).toContain('CRI-12 · Criatura · Animar, round 2');
    expect(text).toContain('Your turn: review this step (kiln did it).');
    expect(text).toContain('  Arte conceptual (from Concepto): 2 files');
    expect(text).toContain('When you review it\n  Mira el bucle.');
    expect(text).toContain(
      'When you finish\n  otea approve CRI-12\n  otea send-back CRI-12 --reason "what to change"',
    );
    expect(text).toContain(
      'Next\n  Pulir, once you approve it; a send-back returns it to Concepto',
    );
  });

  it('lets an agent that picks the way say so', () => {
    const picks = creatures();
    const concept = picks.steps[0];
    if (concept) concept.reviewer = 'none';
    const text = nextText(picks, {
      ...base,
      position: { step: 'sconcept', phase: 'doing' },
      missing: [],
    });
    expect(text).toContain('Next\n  Animar or Done: you pick with --way and say why');
    expect(text).toContain('  otea handoff CRI-12 --way "<Animar|Done>" --reason "why"');
  });

  it('keeps an agent off a step the person does or reviews', () => {
    expect(
      nextText(def, { ...base, position: { step: 'spolish', phase: 'doing' }, missing: [] }),
    ).toBe('CRI-12 · Criatura · Pulir, round 1\nThe person does this step: pick another item.');
    expect(
      nextText(def, { ...base, position: { step: 'sconcept', phase: 'review' }, missing: [] }),
    ).toBe(
      'CRI-12 · Criatura · Concepto, round 1\nWaiting for the person to review it: pick another item.',
    );
    expect(nextText(def, { ...base, position: { closed: 'done' }, missing: [] })).toBe(
      'CRI-12 · Criatura · Done\nClosed: nothing left to do.',
    );
  });
});

describe('refusalText', () => {
  it('says exactly why a handoff was refused and what to do', () => {
    expect(
      refusalText('CRI-12', [
        { ref: 'eart', name: 'Arte conceptual', reason: 'not_new', fresh: true },
        { ref: 'fsteps', name: 'Comprobaciones', reason: 'unchecked', fresh: false },
      ]),
    ).toBe(
      'Not handed off CRI-12: missing Arte conceptual (new this round) and Comprobaciones (every box ticked).\nAttach or fill them with otea attach CRI-12 / otea update CRI-12, then call handoff again.',
    );
  });
});

describe('handedText', () => {
  it('says where a handoff left the item', () => {
    expect(handedText(def, 'CRI-12', { step: 'sconcept', phase: 'review' })).toBe(
      'Handed off. CRI-12 waits for the person to review Concepto.',
    );
    expect(handedText(def, 'CRI-12', { step: 'sanimate', phase: 'review' })).toBe(
      'Handed off. CRI-12 waits for scout to review Animar.',
    );
    expect(handedText(def, 'CRI-12', { step: 'sanimate', phase: 'doing' })).toBe(
      'Handed off. CRI-12 moves on to Animar.',
    );
    expect(handedText(def, 'CRI-12', { closed: 'done' })).toBe('Handed off. CRI-12 is Done.');
  });
});
