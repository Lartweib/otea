import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { defaultLayout } from './modules.ts';
import {
  DEFAULT_TYPE,
  parsePreset,
  readPreset,
  SEVERITY_SCALE,
  typeFor,
  typeOf,
} from './preset.ts';
import { tasks } from './testing.ts';

const TASKS_YAML = `
preset: tasks
preset_version: 1
playbook: ./playbook.md
fields:
  title:       { module: text, required: create }
  description: { module: markdown, required: complete }
  priority:    { module: enum, values: [low, medium, high], default: medium }
workflow:
  initial: todo
  incomplete: incomplete
  states:
    incomplete:  { turn: agent }
    todo:        { turn: agent }
    in_progress: { turn: agent }
    review:      { turn: human }
    done:        { turn: none, closes: done }
    discarded:   { turn: none, closes: discarded }
  transitions:
    - { from: incomplete,  to: todo,        by: agent }
    - { from: todo,        to: in_progress, by: agent }
    - { from: in_progress, to: review,      by: agent }
    - { from: review,      to: done,        by: human-ui }
    - { from: review,      to: todo,        by: human-ui, reason: required }
    - { from: [incomplete, todo, in_progress, review], to: discarded, by: human, reason: required }
    - { from: incomplete,  to: discarded,   by: agent, reason: required }
`;

// biome-ignore lint/suspicious/noExplicitAny: fixtures are arbitrary YAML documents mutated per case
type Raw = Record<string, any>;

function minimal(): Raw {
  return {
    preset: 'notes',
    preset_version: 1,
    fields: { title: { module: 'text', required: 'create' } },
    workflow: {
      initial: 'open',
      states: { open: { turn: 'agent' }, closed: { turn: 'none', closes: 'discarded' } },
      transitions: [{ from: 'open', to: 'closed', by: 'agent' }],
    },
  };
}

function problemsOf(change: (raw: Raw) => void): string[] {
  const raw = minimal();
  change(raw);
  const result = readPreset(stringify(raw));
  return result.ok ? [] : result.problems;
}

describe('readPreset', () => {
  it('reads the tasks preset, expanding transitions with several sources', () => {
    const preset = parsePreset(TASKS_YAML);

    expect(preset).toMatchObject({ name: 'tasks', version: 1, playbook: './playbook.md' });
    expect(preset.fields).toEqual({
      title: { module: 'text', required: 'create' },
      description: { module: 'markdown', required: 'complete' },
      priority: { module: 'enum', values: ['low', 'medium', 'high'], default: 'medium' },
    });
    expect(preset.workflow).toEqual(tasks);
  });

  it('reads a severity field with its fixed scale of four levels as its values', () => {
    const raw = minimal();
    raw.fields.severity = { module: 'severity', required: 'complete', default: 'high' };
    raw.workflow.incomplete = 'draft';
    raw.workflow.states.draft = { turn: 'agent' };
    raw.workflow.transitions.push({ from: 'draft', to: 'open', by: 'agent' });

    expect(SEVERITY_SCALE).toEqual(['low', 'medium', 'high', 'critical']);
    expect(parsePreset(stringify(raw)).fields.severity).toEqual({
      module: 'severity',
      required: 'complete',
      values: ['low', 'medium', 'high', 'critical'],
      default: 'high',
    });
  });

  it('accepts a minimal preset without playbook or incomplete state', () => {
    const result = readPreset(stringify(minimal()));

    expect(result).toMatchObject({ ok: true, preset: { name: 'notes' } });
  });

  it('reports invalid YAML', () => {
    expect(readPreset('preset: [unclosed')).toMatchObject({
      ok: false,
      problems: [expect.stringContaining('invalid YAML')],
    });
  });

  it.each<[string, (raw: Raw) => void, string]>([
    ['a missing version', (raw) => delete raw.preset_version, 'preset_version'],
    ['an unknown key', (raw) => (raw.views = []), 'views'],
    [
      'an unknown turn',
      (raw) => (raw.workflow.states.open.turn = 'robot'),
      'workflow.states.open.turn',
    ],
    [
      'an unknown authority',
      (raw) => (raw.workflow.transitions[0].by = 'boss'),
      'workflow.transitions.0.by',
    ],
    ['a bad field name', (raw) => (raw.fields['Bad Name'] = { module: 'text' }), 'fields'],
  ])('rejects %s by its path', (_, change, path) => {
    expect(problemsOf(change)).toEqual([expect.stringContaining(path)]);
  });

  it.each<[string, (raw: Raw) => void, string]>([
    [
      'an unknown initial state',
      (raw) => (raw.workflow.initial = 'nope'),
      'workflow.initial: unknown state "nope"',
    ],
    [
      'an unknown incomplete state',
      (raw) => (raw.workflow.incomplete = 'nope'),
      'workflow.incomplete: unknown state "nope"',
    ],
    [
      'an incomplete state equal to initial',
      (raw) => (raw.workflow.incomplete = 'open'),
      'workflow.incomplete: must differ from initial',
    ],
    [
      'a complete-required field without an incomplete state',
      (raw) => (raw.fields.body = { module: 'markdown', required: 'complete' }),
      'workflow.incomplete: missing, but field "body" is required: complete',
    ],
    [
      'a transition from an unknown state',
      (raw) => raw.workflow.transitions.push({ from: 'nope', to: 'closed', by: 'agent' }),
      'workflow.transitions.1.from: unknown state "nope"',
    ],
    [
      'a transition to an unknown state',
      (raw) => raw.workflow.transitions.push({ from: 'open', to: 'nope', by: 'agent' }),
      'workflow.transitions.1.to: unknown state "nope"',
    ],
    [
      'a duplicate transition',
      (raw) => raw.workflow.transitions.push({ from: ['open'], to: 'closed', by: 'agent' }),
      'workflow.transitions.1: duplicate transition "open" -> "closed" by agent',
    ],
    [
      'a transition to the same state',
      (raw) => raw.workflow.transitions.push({ from: 'open', to: 'open', by: 'agent' }),
      'workflow.transitions.1: "open" -> "open" does not change state',
    ],
    [
      'an unreachable state',
      (raw) => (raw.workflow.states.limbo = { turn: 'none', closes: 'discarded' }),
      'workflow.states.limbo: not reachable from the initial or incomplete state',
    ],
    [
      'a non-terminal state without a way out',
      (raw) => {
        raw.workflow.states.stuck = { turn: 'human' };
        raw.workflow.transitions.push({ from: 'open', to: 'stuck', by: 'agent' });
      },
      'workflow.states.stuck: has turn human but no outgoing transitions',
    ],
    [
      'a terminal state with a way out',
      (raw) => raw.workflow.transitions.push({ from: 'closed', to: 'open', by: 'human' }),
      'workflow.states.closed: has turn none but outgoing transitions',
    ],
    [
      'a missing title',
      (raw) => delete raw.fields.title,
      'fields.title: missing; every preset needs a title field',
    ],
    [
      'a title that is not text',
      (raw) => (raw.fields.title.module = 'markdown'),
      'fields.title: must use the text module',
    ],
    [
      'a title not required at create',
      (raw) => delete raw.fields.title.required,
      'fields.title: must be required: create',
    ],
    [
      'an unknown module',
      (raw) => (raw.fields.media = { module: 'media' }),
      'fields.media.module: unknown module "media" (official: text, markdown, enum, severity)',
    ],
    [
      'an enum without values',
      (raw) => (raw.fields.size = { module: 'enum' }),
      'fields.size.values: required by the enum module',
    ],
    [
      'values on a non-enum field',
      (raw) => (raw.fields.note = { module: 'text', values: ['a'] }),
      'fields.note.values: only the enum module takes values',
    ],
    [
      'an enum default outside its values',
      (raw) => (raw.fields.size = { module: 'enum', values: ['s', 'm'], default: 'xl' }),
      'fields.size.default: "xl" is not one of s, m',
    ],
    [
      'values on a severity field, whose scale is fixed',
      (raw) => (raw.fields.sev = { module: 'severity', values: ['minor', 'major'] }),
      'fields.sev.values: only the enum module takes values',
    ],
    [
      'a severity default outside its scale',
      (raw) => (raw.fields.sev = { module: 'severity', default: 'urgent' }),
      'fields.sev.default: "urgent" is not one of low, medium, high, critical',
    ],
  ])('rejects %s', (_, change, problem) => {
    expect(problemsOf(change)).toContain(problem);
  });

  it('does not report reachability when there is no known entry state', () => {
    expect(problemsOf((raw) => (raw.workflow.initial = 'nope'))).toEqual([
      'workflow.initial: unknown state "nope"',
    ]);
  });

  it('reports every problem at once', () => {
    const problems = problemsOf((raw) => {
      raw.workflow.initial = 'nope';
      delete raw.fields.title;
    });

    expect(problems.length).toBeGreaterThanOrEqual(2);
  });
});

describe('parsePreset', () => {
  it('throws invalid_preset with every problem', () => {
    const parse = () => parsePreset(stringify({ ...minimal(), fields: {} }));

    expect(parse).toThrow(expect.objectContaining({ code: 'invalid_preset' }));
    expect(parse).toThrow(/fields\.title: missing/);
  });
});

describe('closing kinds', () => {
  it('records what each closed state means', () => {
    const preset = parsePreset(TASKS_YAML);

    expect(preset.workflow.states.filter(({ closes }) => closes)).toEqual([
      { name: 'done', turn: 'none', closes: 'done' },
      { name: 'discarded', turn: 'none', closes: 'discarded' },
    ]);
  });

  it.each<[string, (raw: Raw) => void, string]>([
    [
      'a closed state that does not say how it closes',
      (raw) => delete raw.workflow.states.closed.closes,
      'workflow.states.closed.closes: required on a state with turn none (done or discarded)',
    ],
    [
      'an open state that closes',
      (raw) => (raw.workflow.states.open.closes = 'done'),
      'workflow.states.open.closes: only a state with turn none closes',
    ],
    [
      'an agent closing an item as done',
      (raw) => (raw.workflow.states.closed.closes = 'done'),
      'workflow.transitions.0: an agent cannot close an item as done ("open" -> "closed"); use human or human-ui',
    ],
  ])('rejects %s', (_, change, problem) => {
    expect(problemsOf(change)).toContain(problem);
  });

  it('rejects an unknown closing kind by its path', () => {
    expect(problemsOf((raw) => (raw.workflow.states.closed.closes = 'won'))).toEqual([
      expect.stringContaining('workflow.states.closed.closes'),
    ]);
  });
});

describe('requires', () => {
  const stateOf = (raw: Raw, name: string) => {
    const result = readPreset(stringify(raw));
    if (!result.ok) throw new Error(result.problems.join('; '));
    return { state: result.preset.workflow.states.find((s) => s.name === name), result };
  };

  it('records that entering a closed state requires every child closed first', () => {
    const raw = minimal();
    raw.workflow.states.closed.requires = 'children_closed';

    expect(stateOf(raw, 'closed')).toEqual({
      state: { name: 'closed', turn: 'none', closes: 'discarded', requires: 'children_closed' },
      result: expect.objectContaining({ warnings: [] }),
    });
  });

  it('records it on a working state too', () => {
    const raw = minimal();
    raw.workflow.states.open.requires = 'children_closed';

    expect(stateOf(raw, 'open').state).toEqual({
      name: 'open',
      turn: 'agent',
      requires: 'children_closed',
    });
  });

  it('reads the deprecated close_requires as requires, with a warning', () => {
    const raw = minimal();
    raw.workflow.states.closed.close_requires = 'children_closed';

    const { state, result } = stateOf(raw, 'closed');

    expect(state).toMatchObject({ requires: 'children_closed' });
    expect(result).toMatchObject({
      warnings: [
        'workflow.states.closed.close_requires: deprecated; write requires: children_closed',
      ],
    });
  });

  it('warns on close_requires in a type workflow by its path', () => {
    const raw = twoTypes();
    raw.types.impr.workflow.states.planned.close_requires = 'children_closed';

    expect(stateOf(raw, 'closed').result).toMatchObject({
      warnings: [expect.stringContaining('types.impr.workflow.states.planned.close_requires')],
    });
  });

  it('rejects a state that declares both', () => {
    expect(
      problemsOf((raw) => {
        raw.workflow.states.closed.requires = 'children_closed';
        raw.workflow.states.closed.close_requires = 'children_closed';
      }),
    ).toContain('workflow.states.closed: declares both requires and close_requires; keep requires');
  });

  it('rejects an unknown requirement by its path', () => {
    expect(problemsOf((raw) => (raw.workflow.states.closed.requires = 'all_done'))).toEqual([
      expect.stringContaining('workflow.states.closed.requires'),
    ]);
  });
});

function twoTypes(): Raw {
  const raw = minimal();
  raw.fields.area = { module: 'text' };
  raw.types = {
    bug: {
      label: 'Bug',
      fields: { severity: { module: 'severity', required: 'create' } },
      layout: { header: ['severity'], evidence: [{ module: 'images', variant: 'compare' }] },
    },
    impr: {
      label: 'Improvement',
      fields: { pitch: { module: 'markdown' } },
      workflow: {
        initial: 'idea',
        states: {
          idea: { turn: 'human' },
          planned: { turn: 'none', closes: 'done' },
          dropped: { turn: 'none', closes: 'discarded' },
        },
        transitions: [
          { from: 'idea', to: 'planned', by: 'human' },
          { from: 'idea', to: 'dropped', by: 'agent' },
        ],
      },
    },
  };
  return raw;
}

function typeProblems(change: (raw: Raw) => void): string[] {
  const raw = twoTypes();
  change(raw);
  const result = readPreset(stringify(raw));
  return result.ok ? [] : result.problems;
}

describe('item types', () => {
  it('reads a preset without types as one implicit type with the preset fields and workflow', () => {
    const preset = parsePreset(TASKS_YAML);

    expect(DEFAULT_TYPE).toBe('item');
    expect(preset.types).toEqual([
      {
        name: 'item',
        label: 'Item',
        fields: preset.fields,
        workflow: preset.workflow,
        layout: defaultLayout(preset.fields),
      },
    ]);
    expect(preset.view).toEqual({ kind: 'list', groupBy: 'turn' });
  });

  it('reads declared types: shared fields plus their own, their own workflow or the preset one', () => {
    const preset = parsePreset(stringify(twoTypes()));
    const [bug, impr] = preset.types;

    expect(preset.types.map(({ name, label }) => [name, label])).toEqual([
      ['bug', 'Bug'],
      ['impr', 'Improvement'],
    ]);
    expect(Object.keys(bug?.fields ?? {})).toEqual(['title', 'area', 'severity']);
    expect(bug?.workflow).toEqual(preset.workflow);
    expect(bug?.layout.header).toEqual([{ module: 'severity', field: 'severity' }]);
    expect(bug?.layout.body).toEqual(defaultLayout(bug?.fields ?? {}).body);
    expect(Object.keys(impr?.fields ?? {})).toEqual(['title', 'area', 'pitch']);
    expect(impr?.workflow).toMatchObject({ name: 'notes:impr', initial: 'idea' });
  });

  it('reads the collection view', () => {
    const raw = twoTypes();
    raw.view = { kind: 'board', group_by: 'type' };

    expect(parsePreset(stringify(raw)).view).toEqual({ kind: 'board', groupBy: 'type' });
  });

  it.each<[string, (raw: Raw) => void, string]>([
    ['no types at all', (raw) => (raw.types = {}), 'types: declare at least one type'],
    [
      'a type redeclaring a shared field',
      (raw) => (raw.types.bug.fields.area = { module: 'markdown' }),
      'types.bug.fields.area: already declared by the preset',
    ],
    [
      'a bad field in a type',
      (raw) => (raw.types.impr.fields.size = { module: 'enum' }),
      'types.impr.fields.size.values: required by the enum module',
    ],
    [
      'a problem in a type workflow',
      (raw) => (raw.types.impr.workflow.initial = 'nope'),
      'types.impr.workflow.initial: unknown state "nope"',
    ],
    [
      'an agent closing a type item as done',
      (raw) => (raw.types.impr.workflow.transitions[1].to = 'planned'),
      'types.impr.workflow.transitions.1: an agent cannot close an item as done ("idea" -> "planned"); use human or human-ui',
    ],
    [
      'a type field required to complete with no incomplete state',
      (raw) => (raw.types.impr.fields.pitch.required = 'complete'),
      'types.impr.workflow.incomplete: missing, but field "pitch" is required: complete',
    ],
    [
      'a type field required to complete in the preset workflow with no incomplete state',
      (raw) => (raw.types.bug.fields.severity.required = 'complete'),
      'workflow.incomplete: missing, but field "severity" of type bug is required: complete',
    ],
    [
      'a type layout problem, by its path',
      (raw) => (raw.types.bug.layout.evidence[0].accepts = ['mp4']),
      'types.bug.layout.evidence[0].accepts: "mp4" is a video file; the images module accepts image',
    ],
    [
      'a type layout naming a field of another type',
      (raw) => (raw.types.bug.layout.body = ['pitch']),
      'types.bug.layout.body[0]: unknown field "pitch"',
    ],
    [
      'a preset layout next to types',
      (raw) => (raw.layout = { body: ['area'] }),
      'layout: declare the layout of each type under types.<type>.layout',
    ],
    [
      'an unknown view kind',
      (raw) => (raw.view = { kind: 'gallery' }),
      'view.kind: Invalid option: expected one of "list"|"board"|"grid"',
    ],
    [
      'grouping by a field that is not an enum',
      (raw) => (raw.view = { group_by: 'area' }),
      'view.group_by: "area" is not turn, state, type or an enum or severity field of every type',
    ],
    [
      'grouping by a field only some types have',
      (raw) => (raw.view = { group_by: 'severity' }),
      'view.group_by: "severity" is not turn, state, type or an enum or severity field of every type',
    ],
  ])('rejects %s', (_, change, problem) => {
    expect(typeProblems(change)).toContain(problem);
  });

  it('reads the layout of the implicit type from the preset', () => {
    const raw = minimal();
    raw.fields.area = { module: 'text' };
    raw.layout = { row: ['area'], body: [{ module: 'questions' }] };

    const [only] = parsePreset(stringify(raw)).types;

    expect(only?.layout.row).toEqual([{ module: 'text', field: 'area' }]);
    expect(only?.layout.body).toEqual([{ module: 'questions' }]);
  });

  it('reads the icon of each type, and of the implicit type from the preset', () => {
    const typed = twoTypes();
    typed.types.bug.icon = 'bug';
    const raw = minimal();
    raw.icon = 'checkbox';

    const [bug, impr] = parsePreset(stringify(typed)).types;
    const [only] = parsePreset(stringify(raw)).types;

    expect(bug?.icon).toBe('bug');
    expect(impr).not.toHaveProperty('icon');
    expect(only?.icon).toBe('checkbox');
    expect(parsePreset(stringify(minimal())).types[0]).not.toHaveProperty('icon');
  });

  it.each<[string, (raw: Raw) => void, string]>([
    [
      'a mistyped icon, with the close matches',
      (raw) => (raw.types.bug.icon = 'bugg'),
      'types.bug.icon: unknown icon "bugg" (did you mean bug?)',
    ],
    [
      'an icon close to several',
      (raw) => (raw.types.impr.icon = 'git'),
      'types.impr.icon: unknown icon "git" (did you mean git-merge, git-branch, gift?)',
    ],
    [
      'an icon close to none',
      (raw) => (raw.types.bug.icon = 'zzzzzz'),
      'types.bug.icon: unknown icon "zzzzzz" (none of the 96 icons is close; see the icon list in the preset format)',
    ],
    [
      'a preset icon next to types',
      (raw) => (raw.icon = 'bug'),
      'icon: declare the icon of each type under types.<type>.icon',
    ],
  ])('rejects %s', (_, change, problem) => {
    expect(typeProblems(change)).toContain(problem);
  });

  it('rejects an unknown icon on the implicit type', () => {
    expect(problemsOf((raw) => (raw.icon = 'chekbox'))).toEqual([
      'icon: unknown icon "chekbox" (did you mean checkbox?)',
    ]);
  });

  it('groups by an enum field every type shares', () => {
    const raw = twoTypes();
    raw.fields.priority = { module: 'enum', values: ['low', 'high'] };
    raw.view = { group_by: 'priority' };

    expect(parsePreset(stringify(raw)).view).toEqual({ kind: 'list', groupBy: 'priority' });
  });
});

describe('typeOf and typeFor', () => {
  const single = parsePreset(TASKS_YAML);
  const mixed = parsePreset(stringify(twoTypes()));

  it('finds a type by name', () => {
    expect(typeOf(mixed, 'impr').label).toBe('Improvement');
    expect(() => typeOf(mixed, 'item')).toThrow(
      expect.objectContaining({
        code: 'invalid_type',
        message: 'Unknown type "item" in preset notes (types: bug, impr)',
      }),
    );
  });

  it('defaults to the only type, and needs one when there are several', () => {
    expect(typeFor(single, undefined).name).toBe('item');
    expect(typeFor(mixed, 'bug').name).toBe('bug');
    expect(() => typeFor(mixed, undefined)).toThrow(
      expect.objectContaining({
        code: 'invalid_type',
        message: 'Preset notes has several types; give one of: bug, impr',
      }),
    );
  });
});
