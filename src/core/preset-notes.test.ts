import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type PresetReading, readPreset } from './preset.ts';
import { gateNotes } from './preset-notes.ts';

const BUGS_YAML = `
preset: bugs
preset_version: 1
playbook: ./playbook.md
fields:
  title: { module: text, required: create }
  steps: { module: markdown }
  build_hash: { module: text }
workflow:
  initial: reported
  states:
    reported: { turn: human }
    fixing: { turn: agent }
    verify: { turn: human }
    fixed: { turn: none, closes: done }
    wont_fix: { turn: none, closes: discarded }
  transitions:
    - { from: reported, to: fixing, by: human }
    - { from: fixing, to: verify, by: agent }
    - { from: verify, to: fixed, by: human-ui }
    - { from: verify, to: fixing, by: human, reason: required }
    - { from: [reported, fixing, verify], to: wont_fix, by: human-ui }
  gates:
    ship: [fixed]
types:
  bug:
    label: Bug
    layout:
      body: [steps]
      row: [steps]
      intake: [title]
  improvement:
    label: Improvement
    fields:
      benefit: { module: markdown }
    layout:
      body: [steps, benefit]
      row: [steps]
      intake: [title]
`;

function read(yaml: string, options?: Parameters<typeof readPreset>[1]) {
  const reading: PresetReading = readPreset(yaml, options);
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  return reading;
}

describe('preset notes', () => {
  it('warns about a field that no layout slot of a type places, by its path', () => {
    expect(read(BUGS_YAML).notes).toContainEqual({
      code: 'field_unplaced',
      level: 'warning',
      message:
        'fields.build_hash: placed in no layout slot of bug (header, body, side, row, intake, phone), so nobody sees it',
      path: { section: 'fields', type: 'bug', field: 'build_hash' },
    });
  });

  it('never counts the title as unplaced: the header always shows it', () => {
    const codes = read(BUGS_YAML).notes.filter(({ path }) => path.field === 'title');
    expect(codes).toEqual([]);
  });

  it('warns about a human-turn state that chat can only send back', () => {
    expect(read(BUGS_YAML).notes).toContainEqual({
      code: 'state_stuck_in_chat',
      level: 'warning',
      message:
        'workflow.states.verify: turn human, but a decision relayed from chat cannot move it forward, only to fixing; fixed takes the web UI',
      path: { section: 'states', state: 'verify' },
    });
  });

  it('warns about a human-turn state whose every exit is human-ui', () => {
    const yaml = BUGS_YAML.replace(
      '{ from: verify, to: fixing, by: human, reason: required }',
      '{ from: verify, to: fixing, by: human-ui, reason: required }',
    );
    expect(read(yaml).notes).toContainEqual(
      expect.objectContaining({
        code: 'state_stuck_in_chat',
        message:
          'workflow.states.verify: turn human, but every way out is human-ui, so a decision relayed from chat cannot move it',
      }),
    );
  });

  it('does not warn about a human-turn state that chat moves forward', () => {
    const stuck = read(BUGS_YAML).notes.filter(({ code }) => code === 'state_stuck_in_chat');
    expect(stuck.map(({ path }) => path.state)).toEqual(['verify']);
  });

  it('counts discarding as no way forward', () => {
    const yaml = BUGS_YAML.replace(
      '{ from: reported, to: fixing, by: human }',
      '{ from: reported, to: fixing, by: human-ui }\n    - { from: reported, to: wont_fix, by: human }',
    );
    const stuck = read(yaml).notes.filter(({ code }) => code === 'state_stuck_in_chat');
    expect(stuck.map(({ path }) => path.state)).toEqual(['reported', 'verify']);
  });

  it('warns about a gate that no playbook checks, once the playbooks are given', () => {
    const notes = read(BUGS_YAML, { playbooks: { './playbook.md': 'Fix the bug.' } }).notes;
    expect(notes).toContainEqual({
      code: 'gate_unchecked',
      level: 'warning',
      message:
        'workflow.gates.ship: no playbook of the preset runs otea check --gate ship, and Otea records no gate checks, so nothing may ever stop on it',
      path: { section: 'gates', gate: 'ship' },
    });
  });

  it('takes a gate the playbook checks as called', () => {
    const playbooks = { './playbook.md': 'Before shipping, run `otea check --gate ship`.' };
    const notes = read(BUGS_YAML, { playbooks }).notes;
    expect(notes.filter(({ code }) => code === 'gate_unchecked')).toEqual([]);
  });

  it('skips the gate check while the playbooks are unknown', () => {
    expect(read(BUGS_YAML).notes.filter(({ code }) => code === 'gate_unchecked')).toEqual([]);
  });

  it('notes, as info, a field that only one type has', () => {
    expect(read(BUGS_YAML).notes).toContainEqual({
      code: 'field_single_type',
      level: 'info',
      message:
        'types.improvement.fields.benefit: only improvement has it; it reads as missing when an item switches type',
      path: { section: 'fields', type: 'improvement', field: 'benefit' },
    });
  });

  it('keeps the warning strings: the messages of the warning-level notes', () => {
    const reading = read(BUGS_YAML);
    expect(reading.warnings).toEqual(
      reading.notes.filter(({ level }) => level === 'warning').map(({ message }) => message),
    );
  });

  it('gives a deprecated key its code and path', () => {
    const yaml = BUGS_YAML.replace(
      'fixing: { turn: agent }',
      'fixing: { turn: agent, close_requires: children_closed }',
    );
    expect(read(yaml).notes).toContainEqual({
      code: 'deprecated_key',
      level: 'warning',
      message: 'workflow.states.fixing.close_requires: deprecated; write requires: children_closed',
      path: { section: 'states', state: 'fixing' },
    });
  });

  it('names no type for a gate of the shared workflow', () => {
    const notes = gateNotes(read(BUGS_YAML).preset, {});
    expect(notes.map(({ path }) => path)).toEqual([{ section: 'gates', gate: 'ship' }]);
  });
});

describe('the official presets', () => {
  for (const name of ['architecture', 'bug-triage', 'change', 'review', 'tasks']) {
    it(`${name} places every field it declares`, () => {
      const yaml = readFileSync(
        new URL(`../../presets/${name}/preset.yaml`, import.meta.url),
        'utf8',
      );
      const unplaced = read(yaml).notes.filter(({ code }) => code === 'field_unplaced');
      expect(unplaced).toEqual([]);
    });
  }
});
