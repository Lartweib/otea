import { describe, expect, it } from 'vitest';
import type { Part, Step } from './model.ts';
import { parseDefinition } from './schema.ts';
import { creatures } from './testing.ts';

describe('parseDefinition', () => {
  it('reads a sound definition back as it was', () => {
    expect(parseDefinition(JSON.parse(JSON.stringify(creatures())))).toEqual({
      ok: true,
      definition: creatures(),
    });
  });

  it('refuses a malformed one with where and why, never a stack', () => {
    const bad = { ...creatures(), steps: [{ id: 'Not An Id', name: 'x' }] };
    const result = parseDefinition(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join('\n')).toMatch(/^step 1 "x"/m);
  });

  describe('words a board.json of the wrong shape for whoever wrote it', () => {
    const problemsOf = (raw: unknown) => {
      const result = parseDefinition(raw);
      if (result.ok) throw new Error('expected problems');
      return result.problems;
    };

    it('says in one line which keys a board lacks', () => {
      expect(problemsOf({ name: 'Releases', steps: [] })).toEqual([
        'the board lacks schema, item, icon, title, parts, form, anytime, layout, row, about, idle, cap and samples',
      ]);
    });

    it('says what a lone missing key is for, with an example and where it goes', () => {
      const def = creatures();
      const { back: _back, ...first } = def.steps[0] as Step;
      expect(problemsOf({ ...def, steps: [first, ...def.steps.slice(1)] })).toEqual([
        'step 1 "Concepto" lacks back (where a send-back lands: same (this step) or an earlier step id, e.g. "same") [steps.0.back]',
      ]);
    });

    it('names the place in the board, what was expected and what it found', () => {
      const def = creatures();
      const [first] = def.steps as [Step];
      expect(
        problemsOf({
          ...def,
          schema: 7,
          cap: { on: 'yes', n: 3 },
          parts: {
            ...def.parts,
            fx: { ...def.parts.fdesc, id: 'fx', name: 'Rareza', kind: 'poem' },
          },
          steps: [
            { ...first, id: 'Not An Id', hand: [{ ref: 'fdesc', req: 'maybe', fresh: false }] },
          ],
        }),
      ).toEqual([
        'schema: must be 2, not 7 (the version of the board format: write 2, e.g. 2) [schema]',
        'field "Rareza" (fx) › kind: must be one of "text", "long", "check", "choice", "multi", "level", "number", "date", "yesno", "url", "branch", "images", "video", "audio", "code", "log", "diagram" or "file", not "poem" (a field (text, long, check, choice, multi, level, number, date, yesno, url, branch) or evidence (images, video, audio, code, log, diagram, file), e.g. "long") [parts.fx.kind]',
        'step 1 "Concepto" › id: "Not An Id" is not an id: lowercase letters, digits, - and _, starting with a letter (the hidden id of the step, e.g. "sfix") [steps.0.id]',
        'step 1 "Concepto" › handoff 1 (fdesc) › req: must be "always", "when" or "no", not "maybe" (whether it is required: always, only when another part has a value, or no, e.g. "always") [steps.0.hand.0.req]',
        'cap › on: must be true or false, not "yes" (whether agents add items only while few wait for the person, e.g. false) [cap.on]',
      ]);
    });

    it('lists the keys a part of the board takes when it has one it does not know', () => {
      const def = creatures();
      const [first] = def.steps as [Step];
      expect(problemsOf({ ...def, steps: [{ ...first, owner: 'kiln' }] })).toEqual([
        'step 1 "Concepto": a key a board does not know: "owner" (it takes id, name, doer, reviewer, hand, ways, back, instructions, note, waits, skipWhenReady, doerMayDrop) [steps.0]',
      ]);
    });

    it('says a board is an object', () => {
      expect(problemsOf([])).toEqual(['the board: must be an object, not a list']);
    });
  });

  it('refuses an unknown part kind and a zone that does not exist', () => {
    const def = creatures();
    const kinds = parseDefinition({
      ...def,
      parts: { fx: { ...def.parts.fdesc, id: 'fx', kind: 'poem' } },
    });
    expect(kinds.ok).toBe(false);
    const zones = parseDefinition({ ...def, layout: { fdesc: 'footer' } });
    expect(zones.ok).toBe(false);
  });

  it('refuses a part filed under another id', () => {
    const def = creatures();
    const result = parseDefinition({ ...def, parts: { fother: def.parts.fdesc } });
    expect(result).toEqual({
      ok: false,
      problems: [
        'field "Descripción" (fother) › id: the part says its id is fdesc [parts.fother.id]',
      ],
    });
  });

  it('refuses step ids the engine reserves or cannot read back, and duplicates', () => {
    const def = creatures();
    const [first, second] = def.steps as [(typeof def.steps)[0], (typeof def.steps)[0]];
    const withStep = (id: string) =>
      parseDefinition({ ...def, steps: [{ ...first, id }, ...def.steps.slice(1)] });
    for (const id of ['done', 'dropped', 'same', 'title', 'a__review', 'a__yours']) {
      const result = withStep(id);
      expect(result.ok, id).toBe(false);
      if (!result.ok)
        expect(result.problems[0]).toMatch(/^step 1 "Concepto" › id: .*\[steps\.0\.id\]$/);
    }
    const twice = parseDefinition({ ...def, steps: [first, { ...second, id: first.id }] });
    expect(twice).toEqual({
      ok: false,
      problems: ['step 2 "Animar" › id: another step already has the id sconcept [steps.1.id]'],
    });
  });

  it('refuses a part with the id of the title', () => {
    const def = creatures();
    const result = parseDefinition({
      ...def,
      parts: { ...def.parts, title: { ...def.parts.fdesc, id: 'title' } },
    });
    expect(result.ok).toBe(false);
  });

  it('words what a step doer or reviewer must be', () => {
    const def = creatures();
    const [first] = def.steps;
    const result = parseDefinition({ ...def, steps: [{ ...first, doer: 'kiln' }] });
    expect(result).toEqual({
      ok: false,
      problems: [
        'step 1 "Concepto" › doer: must be "you", "any" or {"agent": "<name>"}, not "kiln" (who does the step: "you" (the person), "any" agent, or one agent, e.g. "any") [steps.0.doer]',
      ],
    });
  });

  it('reads a version 1 definition with every later setting at its default', () => {
    const def = creatures();
    const { drop: _drop, list: _list, ...older } = def;
    const v1 = {
      ...older,
      schema: 1,
      steps: def.steps.map(
        ({ note: _n, waits: _w, skipWhenReady: _s, doerMayDrop: _d, ...step }) => step,
      ),
    };
    expect(parseDefinition(JSON.parse(JSON.stringify(v1)))).toEqual({ ok: true, definition: def });
  });

  it('reads back every capability a board can say', () => {
    const def = creatures();
    def.parts.fbranch = {
      id: 'fbranch',
      name: 'Rama',
      kind: 'branch',
      hint: '',
      options: [],
      guard: { push: ['sanimate'], repo: 'fdesc' },
    };
    def.parts.fbiome = { ...(def.parts.fbiome as Part), initial: 'cswamp' };
    def.steps[0] = {
      ...(def.steps[0] as Step),
      note: { req: 'always', hint: 'qué cambió' },
      waits: ['parts', 'blockers'],
      skipWhenReady: true,
      doerMayDrop: true,
    };
    def.split = { board: 'bother', always: true };
    def.drop = { by: 'page', motives: [{ id: 'wont_fix', name: 'No se arreglará' }] };
    def.list = { as: 'table', group: 'fbiome' };
    def.layout = { ...def.layout, rounds: 'main', parts: 'side' };
    expect(parseDefinition(JSON.parse(JSON.stringify(def)))).toEqual({ ok: true, definition: def });
  });

  it('refuses a motive id a closed state cannot carry, and places as part ids', () => {
    const def = creatures();
    const motive = parseDefinition({
      ...def,
      drop: { by: 'anyone', motives: [{ id: 'won-t-fix', name: 'No' }] },
    });
    expect(motive.ok).toBe(false);
    if (!motive.ok)
      expect(motive.problems[0]).toMatch(/^drop › motive 1 "No" › id: .*\[drop\.motives\.0\.id\]$/);
    for (const id of ['rounds', 'parts']) {
      const result = parseDefinition({
        ...def,
        parts: { ...def.parts, [id]: { ...def.parts.fdesc, id } },
      });
      expect(result.ok, id).toBe(false);
    }
  });

  it('refuses an unknown wait and a guard on a field that is not a branch', () => {
    const def = creatures();
    const [first] = def.steps;
    const wait = parseDefinition({ ...def, steps: [{ ...first, waits: ['children'] }] });
    expect(wait.ok).toBe(false);
    const guard = parseDefinition({
      ...def,
      parts: { ...def.parts, fdesc: { ...def.parts.fdesc, guard: { push: [] } } },
    });
    expect(guard).toEqual({
      ok: false,
      problems: [
        'field "Descripción" (fdesc) › guard: only a branch field is protected [parts.fdesc.guard]',
      ],
    });
  });
});
