import { describe, expect, it } from 'vitest';
import { timeText } from '../time.ts';
import type { Missing } from './engine.ts';
import { boardText, handedText, idleText, nextText, noWayText, refusalText } from './next.ts';
import { creatures, step, tareasDeRepo } from './testing.ts';

describe('nextText of a Done item that names no branch', () => {
  // A board with a protected branch, where this item left Rama empty (P5-R2-6): nothing to merge.
  it('says nothing of a branch, on a board with a land step and on one without', () => {
    const landing = tareasDeRepo();
    landing.steps.push(step('sland', 'Integrar', { reviewer: 'none' }));
    for (const def of [tareasDeRepo(), landing]) {
      const text = nextText(def, {
        id: 'TAR-1',
        title: 'Notas',
        round: 0,
        fields: {},
        evidence: {},
        position: { closed: 'done' },
        missing: [],
      });
      expect(text).toBe(`TAR-1 · ${def.item} · Done\nClosed: nothing left to do.`);
    }
  });
});

const def = creatures();

const base = {
  id: 'CRI-12',
  title: 'Tortuga musgosa',
  round: 1,
  fields: { fdesc: 'Una tortuga con musgo en el caparazón', fbiome: 'cswamp' },
  evidence: {},
};

describe('nextText', () => {
  it('names the item it is part of, and where to read it', () => {
    const text = nextText(def, {
      ...base,
      position: { step: 'sconcept', phase: 'doing' },
      missing: [],
      parent: { id: 'IDE-1', title: 'Pantano vivo', board: 'Ideas', step: 'Planificar' },
    });
    expect(text).toContain(
      '\nPart of\n  IDE-1 · Pantano vivo (Ideas, Planificar): what it decided is in otea show IDE-1\n',
    );
  });

  // A task made from an Idea never named it (IDEA-14): next says what it implements.
  it('names what the item implements, and where to read it', () => {
    const text = nextText(def, {
      ...base,
      position: { step: 'sconcept', phase: 'doing' },
      missing: [],
      implements: [{ id: 'IDE-1', title: 'Pantano vivo', board: 'Ideas' }],
    });
    expect(text).toContain(
      '\nImplements\n  IDE-1 · Pantano vivo (Ideas): what it decided is in otea show IDE-1\n',
    );
  });

  it('leaves out of Starts with what an earlier step left empty', () => {
    const text = nextText(def, {
      ...base,
      evidence: { eart: 2 },
      position: { step: 'sanimate', phase: 'doing' },
      missing: [],
    });
    expect(text).toContain('  Arte conceptual (from Concepto): 2 files');
    expect(text).not.toContain('Barro (from Concepto)');
  });

  it('asks for every box of a required checklist, as its handoff does', () => {
    const text = nextText(def, {
      ...base,
      position: { step: 'sanimate', phase: 'doing' },
      missing: [{ ref: 'fsteps', name: 'Comprobaciones', reason: 'missing', fresh: false }],
    });
    expect(text).toContain('Comprobaciones: required (missing); tick every one of Silueta, Paleta');
    expect(text).not.toContain('any of Silueta');
  });

  it('names the values a level and a yes or no take in the language of the board', () => {
    const board = creatures();
    board.parts.fsev = { id: 'fsev', name: 'Gravedad', kind: 'level', hint: '', options: [] };
    board.parts.fok = { id: 'fok', name: 'Revisado', kind: 'yesno', hint: '', options: [] };
    const animate = board.steps.find(({ id }) => id === 'sanimate');
    animate?.hand.push(
      { ref: 'fsev', req: 'no', fresh: false },
      { ref: 'fok', req: 'no', fresh: false },
    );
    const text = nextText(board, {
      ...base,
      position: { step: 'sanimate', phase: 'doing' },
      missing: [],
    });
    expect(text).toContain('Gravedad: optional; one of baja, media, alta, crítica');
    expect(text).toContain('Revisado: optional; sí or no');
    expect(text).not.toContain('one of low');
  });

  it('names what each field to estimate takes', () => {
    const board = creatures();
    board.parts.fsev = { id: 'fsev', name: 'Esfuerzo', kind: 'level', hint: '', options: [] };
    board.analysis = { ...board.analysis, effort: 'fsev' };
    const text = nextText(board, {
      ...base,
      position: { step: 'sanimate', phase: 'doing' },
      missing: [],
    });
    expect(text).toContain('The person weighs items by Esfuerzo');
    expect(text).toContain('    Esfuerzo: one of baja, media, alta, crítica');
  });

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
      '  otea handoff CRI-12 --note "<what you changed since it was sent back>"',
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

  it('points at the notes when the send-back went with them alone (P4-7)', () => {
    const text = nextText(def, {
      ...base,
      round: 2,
      position: { step: 'sconcept', phase: 'doing' },
      missing: [],
      sentBack: {
        note: '',
        by: { kind: 'human', name: 'fede' },
        at: '2026-11-12T10:04:00.000Z',
        step: 'Concepto',
        round: 1,
      },
    });
    expect(text).toContain(
      '\nSent back to you with the notes from the person above: answer each\n  by the person,',
    );
    expect(text).not.toContain('""');
  });

  it('never offers an agent the review of a step it did in this round', () => {
    const text = nextText(def, {
      ...base,
      round: 2,
      position: { step: 'sanimate', phase: 'review' },
      missing: [],
      me: 'kiln',
      did: ['kiln'],
    });
    expect(text).toBe(
      'CRI-12 · Criatura · Animar, round 2\nYou did this step in this round: another agent reviews it. Pick another item.',
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
      did: ['kiln'],
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
      `CRI-12 · Criatura · Concepto, round 1\nHeld by inv-a until ${timeText(until)}: pick another item.`,
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
      `You hold it until ${timeText(until)}; your otea calls keep it, and on a long step with none (a rebase, a test run), otea heartbeat CRI-12 every 10 minutes.`,
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

  it('says once that there is nothing to do', () => {
    expect(idleText([{ def: quiet, waitingForYou: 0 }])).toBe(
      'Nothing to do on Criaturas right now.',
    );
  });

  it('names every board on one line, then each board’s own words for idle time', () => {
    const tasks = { ...quiet, name: 'Tareas', idle: 'Revisa los tests.', cap: { on: true, n: 2 } };
    expect(
      idleText([
        { def: quiet, waitingForYou: 0 },
        { def: tasks, waitingForYou: 3 },
      ]),
    ).toBe(
      [
        'Nothing to do on Criaturas or Tareas right now.',
        '',
        'On Tareas, when there is nothing to do',
        '  Revisa los tests.',
        '',
        'New items on Tareas',
        '  Do not add items: 3 already wait for the person (the cap is 2).',
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
  const hinted: Missing = {
    ref: 'note',
    name: 'note',
    reason: 'missing',
    fresh: true,
    hint: 'qué cambió en esta ronda',
  };
  const video: Missing = { ref: 'evid', name: 'Vídeo', reason: 'missing', fresh: true };

  it.each<[string, string, Missing[], string]>([
    [
      'says exactly why a handoff was refused and what to do',
      'CRI-12',
      [
        { ref: 'eart', name: 'Arte conceptual', reason: 'not_new', fresh: true },
        { ref: 'fsteps', name: 'Comprobaciones', reason: 'unchecked', fresh: false },
      ],
      'Not handed off CRI-12: missing Arte conceptual (new this round) and Comprobaciones (every box ticked).\nAttach or fill them with otea attach CRI-12 / otea update CRI-12, then call handoff again.',
    ],
    [
      'asks for the note a sent-back round needs, saying why',
      'CRI-12',
      [{ ref: 'note', name: 'note', reason: 'missing', fresh: true, hint: '', sentBack: true }],
      'Not handed off CRI-12: missing a note (it was sent back: say what you changed).\nCall handoff again with --note "<what you changed since it was sent back>".',
    ],
    [
      'asks for the note in its own words, alone',
      'REV-2',
      [hinted],
      'Not handed off REV-2: missing a note.\nCall handoff again with --note "<qué cambió en esta ronda>".',
    ],
    [
      'asks for the note in its own words, with the parts',
      'REV-2',
      [video, hinted],
      [
        'Not handed off REV-2: missing Vídeo (new this round) and a note.',
        'Attach or fill them with otea attach REV-2 / otea update REV-2, then call handoff again with --note "<qué cambió en esta ronda>".',
      ].join('\n'),
    ],
  ])('%s', (_, id, missing, expected) => {
    expect(refusalText(id, missing)).toBe(expected);
  });
});

describe('handedText', () => {
  it('says where a handoff left the item', () => {
    expect(handedText(def, 'CRI-12', { step: 'sconcept', phase: 'review' })).toBe(
      'Handed off. CRI-12 waits for the person to review Concepto.',
    );
    expect(handedText(def, 'CRI-12', { step: 'sanimate', phase: 'review' })).toBe(
      'Handed off. CRI-12 waits for another agent to review Animar.',
    );
    expect(handedText(def, 'CRI-12', { step: 'sanimate', phase: 'doing' })).toBe(
      'Handed off. CRI-12 moves on to Animar.',
    );
    expect(handedText(def, 'CRI-12', { closed: 'done' })).toBe('Handed off. CRI-12 is Done.');
  });
});

describe('boardText', () => {
  it('says the board’s own words: about, idle time, the cap, the values of its fields and each step’s instructions', () => {
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
        'What its fields take',
        '  Bioma: one of Pantano, Bosque',
        '  Comprobaciones: any of Silueta, Paleta',
        '',
        // The fields the board's form takes, so no option it lacks is tried (P1-12).
        'To add one',
        '  otea create --collection Criaturas --title "<title>" --field "Descripción=…" --field "Bioma=…" (Bioma may wait)',
        '',
        '1. Concepto: any agent does it; the person reviews it',
        '   When you take it',
        '     Pinta desde la Descripción.',
        '   Before you hand it off',
        '     Adjunta el Arte conceptual.',
        '',
        '2. Animar: any agent does it; another agent reviews it, never the one that did it',
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

  it('names the values of a level and a yes or no in the language of the board', () => {
    const board = creatures();
    board.parts.fsev = { id: 'fsev', name: 'Gravedad', kind: 'level', hint: '', options: [] };
    board.parts.fok = { id: 'fok', name: 'Revisado', kind: 'yesno', hint: '', options: [] };
    board.steps[0]?.hand.push(
      { ref: 'fsev', req: 'no', fresh: false },
      { ref: 'fok', req: 'no', fresh: false },
    );
    const text = boardText(board);

    expect(text).toContain('  Gravedad: one of baja, media, alta, crítica');
    expect(text).toContain('  Revisado: sí or no');
  });

  it('leaves out a field no step uses', () => {
    const board = creatures();
    const options = [{ id: 'oa', name: 'A' }];
    board.parts.fold = { id: 'fold', name: 'Antiguo', kind: 'choice', hint: '', options };

    expect(boardText(board)).not.toContain('Antiguo');
  });

  it('says how the person weighs the items on the Matrix, and only on a board that has it', () => {
    const board = creatures();
    expect(boardText(board)).not.toContain('Matrix');
    board.parts.feffort = { id: 'feffort', name: 'Esfuerzo', kind: 'level', hint: '', options: [] };
    board.parts.fimp = { id: 'fimp', name: 'Impacto', kind: 'level', hint: '', options: [] };
    board.analysis = { effort: 'feffort', impact: 'fimp' };
    expect(boardText(board)).toContain(
      [
        '',
        'The Matrix',
        '  The person weighs this board’s items on the Matrix, Esfuerzo × Impacto, and fixes the order you take them in: otea next offers them in that order. Estimate Esfuerzo and Impacto on every item you create (otea create … --field "Esfuerzo=…"), the person’s own included, and on every item you take that lacks them (otea update <id> --field "Esfuerzo=…"); the person corrects you.',
      ].join('\n'),
    );
    // P4-R3-4: the person's own to-dos were never estimated, since no agent takes them; the
    // example of how to add one gives the Matrix's fields too.
    expect(boardText(board)).toContain(
      '  otea create --collection Criaturas --title "<title>" --field "Descripción=…" --field "Bioma=…" --field "Esfuerzo=…" --field "Impacto=…" (Bioma may wait)',
    );
  });
});
