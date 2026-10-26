import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parsePreset, readPreset } from './preset.ts';
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
    done:        { turn: none }
    discarded:   { turn: none }
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
      states: { open: { turn: 'agent' }, closed: { turn: 'none' } },
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
      (raw) => (raw.workflow.states.limbo = { turn: 'none' }),
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
      'fields.media.module: unknown module "media" (official: text, markdown, enum)',
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
