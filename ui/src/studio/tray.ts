import type { Preset, PresetNote } from '../../../src/core/preset.ts';
import type { LayoutSlot } from '../types.ts';
import { rawOf, setIn, workflowPath } from './draft.ts';
import { fieldPath, setShownIn } from './layout-edit.ts';

// The not on screen tray: the core's soft notes on a preset that reads, each with what to do about
// it. A preset stays valid either way; these say what the preview cannot show.

export type Fix =
  | { kind: 'place'; slot: LayoutSlot }
  | { kind: 'show' }
  | { kind: 'intended' }
  | { kind: 'playbook'; path?: string }
  | { kind: 'remove-gate' }
  | { kind: 'share' };

export type TrayRow = { note: PresetNote; fixes: Fix[] };

export function trayRows(notes: readonly PresetNote[]): TrayRow[] {
  return notes
    .filter(({ code }) => !code.startsWith('sample_'))
    .map((note): TrayRow => {
      switch (note.code) {
        case 'field_unplaced':
          return { note, fixes: [{ kind: 'place', slot: 'side' }, { kind: 'show' }] };
        case 'state_stuck_in_chat':
          return { note, fixes: [{ kind: 'show' }, { kind: 'intended' }] };
        case 'gate_unchecked':
          return { note, fixes: [{ kind: 'playbook' }, { kind: 'remove-gate' }] };
        case 'field_single_type':
          return { note, fixes: [{ kind: 'share' }, { kind: 'show' }, { kind: 'intended' }] };
        default:
          return { note, fixes: [{ kind: 'show' }] };
      }
    });
}

export type DraftText = { yaml: string; playbooks: Record<string, string> };

// A key of the notes the tray shows, to remember the ones said to be intended.
export const noteKey = ({ code, path }: PresetNote) =>
  [code, path.type, path.field, path.state, path.gate].filter(Boolean).join(':');

export function applyFix(
  draft: DraftText,
  preset: Preset | undefined,
  note: PresetNote,
  fix: Fix,
): DraftText {
  const raw = rawOf(draft.yaml);
  const { path } = note;
  const type = path.type ?? preset?.types[0]?.name;
  if (fix.kind === 'place' && path.field && type) {
    return { ...draft, yaml: setShownIn(draft.yaml, preset, type, path.field, fix.slot, true) };
  }
  if (fix.kind === 'remove-gate' && path.gate) {
    const at = workflowPath(raw, path.type);
    return { ...draft, yaml: setIn(draft.yaml, [...at, 'gates', path.gate], undefined) };
  }
  if (fix.kind === 'playbook' && path.gate) {
    const file = fix.path ?? raw.playbook ?? './playbook.md';
    const states = (preset?.types[0]?.workflow.gates?.[path.gate] ?? []).join(', ');
    const line = `\nBefore moving into ${states || 'its states'}, run \`otea check --gate ${path.gate}\`.\n`;
    const yaml = raw.playbook ? draft.yaml : setIn(draft.yaml, ['playbook'], file);
    return {
      yaml,
      playbooks: { ...draft.playbooks, [file]: `${draft.playbooks[file] ?? ''}${line}` },
    };
  }
  if (fix.kind === 'share' && path.field && path.type) {
    const own = raw.types?.[path.type]?.fields?.[path.field];
    if (!own) return draft;
    let yaml = setIn(draft.yaml, fieldPath(raw, path.type, path.field), undefined);
    yaml = setIn(yaml, ['fields', path.field], own);
    return { ...draft, yaml };
  }
  return draft;
}
