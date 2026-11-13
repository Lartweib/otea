import { describe, expect, it } from 'vitest';
import { handoffCheck, type Linked, type Missing } from './engine.ts';
import type { BoardDefinition } from './model.ts';
import {
  approvalRefusalText,
  createdText,
  droppedText,
  dropRefusalText,
  gateText,
  NOT_TAKEN_BACK,
  nextText,
  parentRequiredText,
  parentTypeText,
  refusalText,
  takenBackText,
} from './next.ts';
import { cambios, errores, tareasDeRepo } from './testing.ts';

const base = {
  id: 'BUG-4',
  title: 'El faro no se enciende',
  round: 1,
  fields: { fsteps: 'abrir el faro', fcat: 'cgame', fbranch: 'feat/x', frepo: 'api' },
  evidence: {},
  missing: [] as Missing[],
};

const rt = (id: string, step: string): Linked => ({
  id,
  board: 'Tareas de repo',
  step,
  closed: false,
});
const doneRt = (id: string): Linked => ({ id, board: 'Tareas de repo', closed: true });

function lines(text: string, title: string): string[] {
  const all = text.split('\n');
  const start = all.indexOf(title);
  if (start < 0) return [];
  const end = all.indexOf('', start);
  return all.slice(start, end < 0 ? undefined : end);
}

describe('nextText, the later settings', () => {
  it('offers the way back and the drop under Next, with their exact commands', () => {
    const def = errores();
    const text = nextText(def, {
      ...base,
      position: { step: 'sfix', phase: 'doing' },
      me: 'mender',
    });
    expect(lines(text, 'Next')).toEqual([
      'Next',
      '  Done, once the person approves it',
      '  Or take it back to Triar (no review; Triar starts its next round):',
      '    otea handoff BUG-4 --way "Triar" --reason "why"',
      '  Or drop it if it is not worth doing: otea drop BUG-4 --reason "why" --motive "Rechazado|Duplicado"',
    ]);
    expect(lines(text, 'When you finish')).toEqual([
      'When you finish',
      '  otea handoff BUG-4 --note "<la prueba>"',
    ]);
  });

  it('lists the note first in the Handoff, then the parts, then what it waits for', () => {
    const def = errores();
    const facts = {
      fields: {},
      evidence: [],
      parts: [rt('RT-4', 'Implementar'), rt('RT-7', 'Propuesta'), doneRt('RT-2')],
      blockers: [{ id: 'BUG-9', board: 'Errores', step: 'Arreglar', closed: false }],
    };
    const text = nextText(def, {
      ...base,
      position: { step: 'sfix', phase: 'doing' },
      missing: handoffCheck(def, 'sfix', facts).missing,
      parts: facts.parts,
      blockers: facts.blockers,
      me: 'mender',
    });
    expect(lines(text, 'Handoff')).toEqual([
      'Handoff',
      '  ✗ Note: required (la prueba)',
      '  ✗ Cambios de código: required (missing)',
      '  ✗ Tareas de repo finished: required (2 of 3 open: RT-4 in Implementar, RT-7 in Propuesta)',
      '  ✗ Nothing open blocks it: required (BUG-9 on Errores, in Arreglar, blocks it)',
    ]);
    const clear = nextText(def, {
      ...base,
      position: { step: 'sfix', phase: 'doing' },
      parts: [doneRt('RT-2')],
      blockers: [],
      me: 'mender',
    });
    expect(lines(clear, 'Handoff').slice(-2)).toEqual([
      '  ✓ Tareas de repo finished: required',
      '  ✓ Nothing open blocks it: required',
    ]);
  });

  it('says what the protected branch allows in each phase', () => {
    const def = errores();
    const doing = nextText(def, {
      ...base,
      position: { step: 'sfix', phase: 'doing' },
      me: 'mender',
    });
    expect(lines(doing, 'Branch')).toEqual([
      'Branch',
      '  feat/x in api: you may push while you do Arreglar. While it is reviewed it is frozen; it can be merged only once it is Done.',
    ]);
    // The section sits right after the Handoff.
    const sections = doing.split('\n').filter((line) => /^[A-Z]/.test(line));
    expect(sections.indexOf('Branch')).toBe(sections.indexOf('Handoff') + 1);
    const elsewhere = nextText(def, { ...base, position: { step: 'sfill', phase: 'doing' } });
    expect(lines(elsewhere, 'Branch')).toEqual([
      'Branch',
      '  feat/x in api: no pushes in Completar. You may push in Arreglar.',
    ]);
    const done = nextText(def, { ...base, position: { closed: 'done' } });
    expect(done).toBe(
      'BUG-4 · Bug · Done\nClosed: nothing left to do. Its branch feat/x may be merged now.',
    );
  });

  it('says the base branch takes the branch only once Done, when the board protects it', () => {
    const def = errores();
    const branch = Object.values(def.parts).find((part) => part.guard);
    if (!branch?.guard) throw new Error('no protected branch');
    branch.guard.base = 'main';
    const doing = nextText(def, {
      ...base,
      position: { step: 'sfix', phase: 'doing' },
      me: 'mender',
    });
    expect(lines(doing, 'Branch')).toEqual([
      'Branch',
      '  feat/x in api: you may push while you do Arreglar. While it is reviewed it is frozen; it can be merged only once it is Done.',
      '  main is protected too: push or merge feat/x into it only once BUG-4 is Done.',
    ]);
  });

  it('tells an agent reviewer the branch is frozen', () => {
    const def = errores();
    def.steps[2] = { ...def.steps[2]!, reviewer: { agent: 'scout' } };
    const review = nextText(def, {
      ...base,
      position: { step: 'sfix', phase: 'review' },
      me: 'scout',
    });
    expect(lines(review, 'Branch')).toEqual([
      'Branch',
      '  feat/x in api is frozen while scout reviews it: do not push. It can be merged only once it is Done.',
    ]);
  });

  it('heads a discard with its motive', () => {
    expect(
      nextText(errores(), { ...base, position: { closed: 'dropped', motive: 'duplicate' } }),
    ).toBe('BUG-4 · Bug · Dropped (Duplicado)\nClosed: nothing left to do.');
  });

  it('shows the parts of a board that divides, and how to add one', () => {
    const def = cambios();
    const text = nextText(def, {
      ...base,
      id: 'CH-3',
      fields: {},
      position: { step: 'sexec', phase: 'doing' },
      parts: [rt('RT-4', 'Implementar'), rt('RT-7', 'Propuesta'), doneRt('RT-2')],
      child: tareasDeRepo(),
    });
    expect(lines(text, 'Parts')).toEqual([
      'Parts',
      '  Tareas de repo: 1 of 3 finished (open: RT-4 in Implementar, RT-7 in Propuesta)',
      '  Add one: otea create --collection "Tareas de repo" --parent CH-3 --title "…" --field "Repo=…" --field "Rama=…"',
    ]);
    const sections = text.split('\n').filter((line) => /^[A-Z]/.test(line));
    expect(sections.indexOf('Parts')).toBe(sections.indexOf('Starts with') + 1);
    const none = nextText(def, {
      ...base,
      id: 'CH-3',
      fields: {},
      position: { step: 'sanalyse', phase: 'doing' },
      parts: [],
      child: tareasDeRepo(),
    });
    expect(lines(none, 'Parts')[1]).toBe('  Tareas de repo: none yet');
  });
});

describe('refusals and answers', () => {
  const note: Missing = {
    ref: 'note',
    name: 'note',
    reason: 'missing',
    fresh: true,
    hint: 'qué cambió en esta ronda',
  };
  const video: Missing = { ref: 'evid', name: 'Vídeo', reason: 'missing', fresh: true };

  it('asks for the note in its own words, alone or with the parts', () => {
    expect(refusalText('REV-2', [note])).toBe(
      'Not handed off REV-2: missing a note.\nCall handoff again with --note "<qué cambió en esta ronda>".',
    );
    expect(refusalText('REV-2', [video, note])).toBe(
      [
        'Not handed off REV-2: missing Vídeo (new this round) and a note.',
        'Attach or fill them with otea attach REV-2 / otea update REV-2, then call handoff again with --note "<qué cambió en esta ronda>".',
      ].join('\n'),
    );
  });

  it('names the open parts and the blockers when only the waits hold it', () => {
    const parts: Missing = {
      ref: 'wait:parts',
      name: 'Tareas de repo',
      reason: 'open',
      fresh: false,
      open: [rt('RT-4', 'Implementar'), rt('RT-7', 'Propuesta')],
      total: 3,
    };
    expect(refusalText('CH-3', [parts])).toBe(
      [
        'Not handed off CH-3: 2 of its 3 Tareas de repo are not finished: RT-4 (Implementar), RT-7 (Propuesta).',
        'Nothing moves CH-3 for them: hand it off again once they are Done or Dropped.',
      ].join('\n'),
    );
    const all: Missing = { ...parts, open: [rt('RT-4', 'Implementar')], total: 1 };
    expect(refusalText('CH-3', [all]).split('\n')[0]).toBe(
      'Not handed off CH-3: its part RT-4 (Implementar) is not finished.',
    );
    const blockers: Missing = {
      ref: 'wait:blockers',
      name: '',
      reason: 'open',
      fresh: false,
      open: [{ id: 'BUG-9', board: 'Errores', step: 'Arreglar', closed: false }],
    };
    expect(refusalText('TASK-3', [blockers])).toBe(
      [
        'Not handed off TASK-3: BUG-9 (Errores, Arreglar) blocks it and is not finished.',
        'Hand it off again once BUG-9 is Done or Dropped, or ask the person to remove the link.',
      ].join('\n'),
    );
    expect(approvalRefusalText('CH-3', [{ ...parts, open: [rt('RT-4', 'Implementar')] }])).toBe(
      'Not approved CH-3: RT-4 (Implementar) was reopened and is not finished.',
    );
  });

  it('answers a way back, and refuses one without a reason', () => {
    expect(takenBackText(errores(), 'BUG-4', 'striage', 2)).toBe(
      'Taken back. BUG-4 returns to Triar, round 2.',
    );
    expect(NOT_TAKEN_BACK).toBe('Not taken back: say why with --reason.');
  });

  it('words every refused drop, and the drop itself', () => {
    const def = errores();
    expect(dropRefusalText(def, 'BUG-4', 'motive_required')).toBe(
      'Not dropped BUG-4: say which with --motive "Rechazado|Duplicado".',
    );
    expect(dropRefusalText(def, 'TASK-3', 'not_droppable')).toBe(
      'Not dropped TASK-3: only the person drops items here.',
    );
    expect(dropRefusalText(def, 'BUG-4', 'not_relayable')).toBe(
      "Not relayed: on Errores the person drops items from the item's page.",
    );
    expect(dropRefusalText(def, 'BUG-4', 'reason_required')).toBe(
      'Not dropped BUG-4: say why with --reason.',
    );
    expect(droppedText(def, 'BUG-4', { closed: 'dropped', motive: 'duplicate' })).toBe(
      'Dropped. BUG-4 is Dropped (Duplicado).',
    );
  });

  it('says where a new item starts, and why', () => {
    const def = errores();
    expect(createdText(def, 'BUG-12', { step: 'striage', phase: 'doing' }, [])).toBe(
      'Created BUG-12 in Triar: it already had everything Completar asks for.',
    );
    const missing = handoffCheck(def, 'sfill', { fields: {}, evidence: [] }).missing;
    expect(createdText(def, 'BUG-12', { step: 'sfill', phase: 'doing' }, missing)).toBe(
      'Created BUG-12 in Completar: missing Pasos. Fill them, then otea handoff BUG-12.',
    );
    expect(createdText(cambios(), 'CH-1', { step: 'sanalyse', phase: 'doing' }, [])).toBe(
      'Created CH-1 in Analizar.',
    );
  });

  it('refuses a part made alone or under the wrong board', () => {
    const parent: BoardDefinition = cambios();
    expect(parentRequiredText(tareasDeRepo(), parent)).toBe(
      "Not created: a Tarea de repo is always part of a Cambio. Create it with --parent <the Cambio's id>.",
    );
    expect(parentTypeText(parent, tareasDeRepo(), 'TASK-3', 'Tareas')).toBe(
      'Not linked: the parts of a Cambio are Tareas de repo, and TASK-3 is on Tareas.',
    );
  });

  it("answers otea check in the board's words", () => {
    const def = tareasDeRepo();
    expect(gateText(def, 'RT-4', { step: 'simpl', phase: 'doing' }, 'push', 1)).toBe(
      'push allowed: RT-4 is being done in Implementar.',
    );
    expect(gateText(def, 'RT-4', { step: 'simpl', phase: 'review' }, 'push', 1)).toBe(
      'push refused: RT-4 waits for the person to review Implementar; its branch can be pushed only while Implementar is being done.',
    );
    expect(gateText(def, 'RT-4', { step: 'simpl', phase: 'doing' }, 'merge', 2)).toBe(
      'merge refused: RT-4 is in Implementar, round 2; its branch can be merged only once RT-4 is Done.',
    );
    expect(gateText(def, 'RT-4', { step: 'simpl', phase: 'review' }, 'merge', 2)).toBe(
      'merge refused: RT-4 is in the review of Implementar, round 2; its branch can be merged only once RT-4 is Done.',
    );
    expect(gateText(def, 'RT-4', { step: 'sprop', phase: 'doing' }, 'push', 1)).toBe(
      'push refused: RT-4 is in Propuesta; its branch can be pushed only while Implementar is being done.',
    );
    expect(gateText(def, 'RT-4', { closed: 'done' }, 'merge', 1)).toBe(
      'merge allowed: RT-4 is Done.',
    );
  });
});
