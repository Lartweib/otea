import { describe, expect, it } from 'vitest';
import { clockTime } from '../lease.ts';
import { boardText, handedText, idleText, nextText, noWayText, refusalText } from './next.ts';
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
        'Claim it first: otea claim CRI-12 (otea next --claim takes and claims the next in one call).',
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

  it('starts a round that was sent back with the note, who sent it, when and from which review', () => {
    const text = nextText(def, {
      ...base,
      round: 2,
      position: { step: 'sconcept', phase: 'doing' },
      missing: [
        { ref: 'eart', name: 'Arte conceptual', reason: 'not_new', fresh: true },
        { ref: 'note', name: 'note', reason: 'missing', fresh: true, hint: '', sentBack: true },
      ],
      sentBack: {
        note: 'Más barro en las patas.\nY la concha más oscura.',
        by: { kind: 'agent', name: 'scout' },
        at: '2026-11-12T10:04:00.000Z',
        step: 'Animar',
        round: 1,
      },
    });
    const lines = text.split('\n');
    expect(lines.slice(0, 7)).toEqual([
      'CRI-12 · Criatura · Concepto, round 2',
      'Your turn: do this step.',
      'Claim it first: otea claim CRI-12 (otea next --claim takes and claims the next in one call).',
      '',
      'Sent back to you: "Más barro en las patas.',
      '  Y la concha más oscura."',
      '  by scout, 2026-11-12 10:04 UTC, from the review of Animar round 1',
    ]);
    expect(text).toContain(
      '\nHandoff\n  ✗ Note: required (what you changed since it was sent back)\n',
    );
    expect(text).toContain(
      '  otea handoff CRI-12 --note "what you changed since it was sent back"',
    );
  });

  it('names the person who sent it back as the person', () => {
    const text = nextText(def, {
      ...base,
      round: 2,
      position: { step: 'sconcept', phase: 'doing' },
      missing: [],
      sentBack: {
        note: 'Otra pose',
        by: { kind: 'human', name: 'fede' },
        at: '2026-11-12T10:04:00.000Z',
        step: 'Concepto',
        round: 1,
      },
    });
    expect(text).toContain(
      '\nSent back to you: "Otra pose"\n  by the person, 2026-11-12 10:04 UTC, from the review of Concepto round 1\n',
    );
    expect(text).toContain('  ✓ Note: required (what you changed since it was sent back)');
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

describe('nextText with a lease', () => {
  const doing = { ...base, position: { step: 'sconcept', phase: 'doing' as const }, missing: [] };
  const until = '2026-11-13T03:09:49.806Z';

  it('sends an agent to another item while another agent holds this one, never saying it is its turn', () => {
    const text = nextText(def, {
      ...doing,
      me: 'inv-b',
      holder: { name: 'inv-a', expiresAt: until },
    });
    expect(text).toBe(
      `CRI-12 · Criatura · Concepto, round 1\nHeld by inv-a until ${clockTime(until)}: pick another item.`,
    );
  });

  it('reads as usual to the holder itself', () => {
    const text = nextText(def, {
      ...doing,
      me: 'inv-a',
      holder: { name: 'inv-a', expiresAt: until },
    });
    expect(text).toContain('Your turn: do this step.');
    expect(text).not.toContain('Held by');
  });

  it('says whom the person left a stuck item for', () => {
    expect(nextText(def, { ...doing, me: 'inv-b', leftFor: 'resumidor' })).toBe(
      'CRI-12 · Criatura · Concepto, round 1\nLeft for resumidor: pick another item.',
    );
    const mine = nextText(def, { ...doing, me: 'resumidor', leftFor: 'resumidor' });
    expect(mine).toContain('Your turn: do this step.\nThe person left it for you.');
  });

  it('tells an agent to claim an item nobody holds before it starts', () => {
    const text = nextText(def, { ...doing, me: 'inv-a' });
    expect(text.split('\n').slice(0, 3)).toEqual([
      'CRI-12 · Criatura · Concepto, round 1',
      'Your turn: do this step.',
      'Claim it first: otea claim CRI-12 (otea next --claim takes and claims the next in one call).',
    ]);
    const review = nextText(def, {
      ...base,
      position: { step: 'sanimate', phase: 'review' },
      missing: [],
      me: 'scout',
    });
    expect(review).toContain('Claim it first: otea claim CRI-12 ');
  });

  it('tells the holder until when it holds the item, and how to keep it', () => {
    const text = nextText(def, {
      ...doing,
      me: 'inv-a',
      holder: { name: 'inv-a', expiresAt: until },
    });
    expect(text.split('\n')[2]).toBe(
      `You hold it until ${clockTime(until)}; otea heartbeat CRI-12 keeps it longer.`,
    );
    expect(text).not.toContain('Claim it first');
  });
});

describe('nextText, what the item starts with', () => {
  const doing = { ...base, position: { step: 'sconcept', phase: 'doing' as const }, missing: [] };

  it('gives every line of a value, indented under its name', () => {
    const text = nextText(def, {
      ...doing,
      fields: {
        ...base.fields,
        fdesc: 'Una tortuga con musgo.\nCamina lento.\n\nVive en el barro.',
      },
    });
    expect(text).toContain(
      [
        '  Descripción: Una tortuga con musgo.',
        '    Camina lento.',
        '    ',
        '    Vive en el barro.',
        '  Bioma: Pantano',
      ].join('\n'),
    );
  });

  it('points to otea show for a value too long to give whole', () => {
    const long = `${'Musgo verde. '.repeat(60)}FIN`;
    const text = nextText(def, { ...doing, fields: { ...base.fields, fdesc: long } });
    const line = text.split('\n').find((each) => each.startsWith('  Descripción: ')) ?? '';
    expect(line).not.toContain('FIN');
    expect(line.endsWith('… (the whole of it: otea show CRI-12)')).toBe(true);
    expect(line.length).toBeLessThan(560);
  });
});

describe('idleText', () => {
  const quiet = { ...def, idle: '' };

  it('says once that there is nothing to do, and how to wait for the next item', () => {
    expect(idleText([{ def: quiet, waitingForYou: 0 }])).toBe(
      [
        'Nothing to do on Criaturas right now.',
        'Wait for one: otea wait --turn agent --unclaimed, then otea next.',
      ].join('\n'),
    );
  });

  it('names every board on one line, then each board’s own words for idle time', () => {
    const tasks = { ...quiet, name: 'Tareas', idle: 'Revisa los tests.', cap: { on: true, n: 2 } };
    expect(
      idleText(
        [
          { def: quiet, waitingForYou: 0 },
          { def: tasks, waitingForYou: 3 },
        ],
        'Tareas',
      ),
    ).toBe(
      [
        'Nothing to do on Criaturas or Tareas right now.',
        '',
        'On Tareas, when there is nothing to do',
        '  Revisa los tests.',
        '',
        'New items on Tareas',
        '  Do not add items: 3 already wait for the person (the cap is 2).',
        '',
        'Wait for one: otea wait --turn agent --unclaimed --collection Tareas, then otea next --collection Tareas.',
      ].join('\n'),
    );
  });
});

describe('noWayText', () => {
  it('lists the ways an item may go from its step, forward and back', () => {
    const back = {
      ...def,
      steps: def.steps.map((step) =>
        step.id === 'sanimate' ? { ...step, ways: [...step.ways, 'sconcept'] } : step,
      ),
    };
    expect(noWayText(back, 'CRI-12', 'sanimate', 'Triar')).toBe(
      'CRI-12 has no way "Triar" from Animar. From Animar it goes on to Pulir, or back to Concepto (otea handoff CRI-12 --way "Concepto" --reason "why").',
    );
    expect(noWayText(def, 'CRI-12', 'sconcept', 'Nowhere')).toBe(
      'CRI-12 has no way "Nowhere" from Concepto. From Concepto it goes on to Animar or Done.',
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

describe('refusalText after a send-back', () => {
  it('asks for the note the sent-back round needs, saying why', () => {
    expect(
      refusalText('CRI-12', [
        { ref: 'note', name: 'note', reason: 'missing', fresh: true, hint: '', sentBack: true },
      ]),
    ).toBe(
      'Not handed off CRI-12: missing a note (it was sent back: say what you changed).\nCall handoff again with --note "what you changed since it was sent back".',
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

describe('boardText', () => {
  it('says the board’s own words: about, idle time, the cap and each step’s instructions', () => {
    const board = { ...def, idle: 'Ordena el @[eart].', cap: { on: true, n: 2 } };

    expect(boardText(board)).toBe(
      [
        'Criaturas: steps for each Criatura',
        '',
        'About this board',
        '  Cada criatura del pantano.',
        '',
        'When there is nothing to do',
        '  Ordena el Arte conceptual.',
        '',
        'New items',
        '  Add items only while fewer than 2 wait for the person.',
        '',
        '1. Concepto: any agent does it; the person reviews it',
        '   When you take it',
        '     Pinta desde la Descripción.',
        '   Before you hand it off',
        '     Adjunta el Arte conceptual.',
        '',
        '2. Animar: kiln does it; scout reviews it',
        '   When you take it',
        '     Parte del Arte conceptual de Concepto.',
        '   When you review it',
        '     Mira el bucle.',
        '',
        '3. Pulir: the person does it',
        '',
        'Run otea next to get the item to take now.',
      ].join('\n'),
    );
  });
});
