import { readFileSync } from 'node:fs';
import { parsePreset } from './preset.ts';

const TASKS_PRESET = new URL('../../presets/tasks/preset.yaml', import.meta.url);

export const tasksPreset = parsePreset(readFileSync(TASKS_PRESET, 'utf8'));

export const tasks = tasksPreset.workflow;

// A collection of two item types: bugs follow the preset workflow, improvements their own.
export const MIXED_YAML = `
preset: work
preset_version: 1
fields:
  title: { module: text, required: create }
  area: { module: text }
workflow:
  initial: reported
  states:
    reported: { turn: human }
    fixing: { turn: agent }
    fixed: { turn: none, closes: done }
    rejected: { turn: none, closes: discarded }
  transitions:
    - { from: reported, to: fixing, by: human }
    - { from: fixing, to: fixed, by: human-ui }
    - { from: [reported, fixing], to: rejected, by: human }
types:
  bug:
    label: Bug
    fields:
      severity: { module: severity, required: create }
    layout:
      header: [severity]
      evidence: [{ module: images, variant: compare }]
  impr:
    label: Improvement
    fields:
      pitch: { module: markdown, required: complete }
    workflow:
      initial: idea
      incomplete: draft
      states:
        draft: { turn: agent }
        idea: { turn: human }
        planned: { turn: none, closes: done }
        dropped: { turn: none, closes: discarded }
      transitions:
        - { from: draft, to: idea, by: agent }
        - { from: idea, to: planned, by: human }
        - { from: [draft, idea], to: dropped, by: agent, reason: required }
    layout:
      body: [pitch, { module: questions }]
`;

export const mixedPreset = parsePreset(MIXED_YAML);

// bug: a compare and a log; impr: a gallery and a mockup (both images), a diff and a recording.
export const EVIDENCE_YAML = `
preset: proof
preset_version: 1
fields:
  title: { module: text, required: create }
workflow:
  initial: open
  states: { open: { turn: agent }, closed: { turn: none, closes: discarded } }
  transitions: [{ from: open, to: closed, by: agent }]
types:
  bug:
    label: Bug
    layout:
      evidence:
        - { module: images, variant: compare, accepts: [png, gif] }
        - { module: log, required: true }
  impr:
    label: Improvement
    layout:
      evidence: [{ module: images, id: screens, variant: gallery }, { module: diff }]
      side: [{ module: images, id: mockup }, { module: recording }]
`;

export const evidencePreset = parsePreset(EVIDENCE_YAML);
