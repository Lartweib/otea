import { describe, expect, it } from 'vitest';
import type { PresetNote } from '../../../src/core/preset.ts';
import { rawOf, readDraft } from './draft.ts';
import { applyFix, trayRows } from './tray.ts';

const PRESET = `preset: game-bugs
preset_version: 3
fields:
  title: { module: text, required: create }
  build_hash: { module: text }
workflow:
  initial: open
  gates:
    ship: [done]
  states:
    open: { turn: human }
    done: { turn: none, closes: done }
  transitions:
    - { from: open, to: done, by: human }
types:
  bug:
    label: Bug
    layout:
      body: [title]
      row: []
      intake: [title]
  improvement:
    label: Improvement
    fields:
      benefit: { module: markdown }
    layout:
      body: [benefit, build_hash]
      intake: [title]
`;

const notes = (): PresetNote[] => {
  const reading = readDraft(PRESET, {});
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  return reading.notes;
};

function preset() {
  const reading = readDraft(PRESET);
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  return reading.preset;
}

describe('the not on screen tray', () => {
  it('reads each soft note as a row with what to do about it', () => {
    const rows = trayRows(notes());
    expect(rows.map(({ note }) => note.code)).toEqual([
      'field_unplaced',
      'gate_unchecked',
      'field_single_type',
    ]);
    expect(rows[0]?.fixes.map(({ kind }) => kind)).toEqual(['place', 'show']);
    expect(rows[1]?.fixes.map(({ kind }) => kind)).toEqual(['playbook', 'remove-gate']);
    expect(rows[2]?.fixes.map(({ kind }) => kind)).toEqual(['share', 'show', 'intended']);
  });

  it('places an unplaced field in the side of its type', () => {
    const [unplaced] = trayRows(notes());
    if (!unplaced) throw new Error('a row');
    const next = applyFix({ yaml: PRESET, playbooks: {} }, preset(), unplaced.note, {
      kind: 'place',
      slot: 'side',
    });
    expect(rawOf(next.yaml).types?.bug?.layout).toMatchObject({
      side: [{ module: 'relations' }, 'build_hash'],
    });
  });

  it('adds the gate to the playbook, or removes it', () => {
    const gate = trayRows(notes())[1];
    if (!gate) throw new Error('a row');
    const added = applyFix(
      { yaml: PRESET, playbooks: { './playbook.md': '# Play\n' } },
      preset(),
      gate.note,
      { kind: 'playbook', path: './playbook.md' },
    );
    expect(added.playbooks['./playbook.md']).toContain('otea check --gate ship');
    const removed = applyFix({ yaml: PRESET, playbooks: {} }, preset(), gate.note, {
      kind: 'remove-gate',
    });
    expect(rawOf(removed.yaml).workflow?.gates).toBeUndefined();
  });

  it('shares a field of one type with every type', () => {
    const single = trayRows(notes())[2];
    if (!single) throw new Error('a row');
    const next = applyFix({ yaml: PRESET, playbooks: {} }, preset(), single.note, {
      kind: 'share',
    });
    expect(rawOf(next.yaml).fields?.benefit).toEqual({ module: 'markdown' });
    expect(rawOf(next.yaml).types?.improvement?.fields).toBeUndefined();
  });
});
