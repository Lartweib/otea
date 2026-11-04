import type { LayoutSlot } from './modules.ts';
import type { ItemType, Preset } from './preset.ts';
import type { Workflow } from './workflow.ts';

// Soft notes on a preset that reads: what it should look at, never what stops it loading. Each has a
// stable code, a message that starts with its dotted place in the YAML (as problems do), and a
// structured path, so Studio can open the part it is about. Warnings are worth fixing; info notes
// only say what the preset does, in case it was not meant.

export type PresetNoteCode =
  | 'deprecated_key'
  | 'field_unplaced'
  | 'state_stuck_in_chat'
  | 'gate_unchecked'
  | 'field_single_type'
  | 'sample_invalid'
  | 'sample_unknown_type'
  | 'sample_unknown_state'
  | 'sample_unknown_field'
  | 'sample_invalid_value'
  | 'sample_missing_file';

export type PresetSection = 'fields' | 'layout' | 'states' | 'moves' | 'gates' | 'samples';

// `type` is set when the note is about one type (its own field, its own workflow); `index` is a
// sample's position in samples.yaml.
export type PresetPath = {
  section: PresetSection;
  type?: string;
  field?: string;
  state?: string;
  gate?: string;
  slot?: LayoutSlot;
  index?: number;
  file?: string;
};

export type PresetNote = {
  code: PresetNoteCode;
  level: 'warning' | 'info';
  message: string;
  path: PresetPath;
};

// The slots a field can be seen in. evidence takes files, never a field.
const FIELD_SLOTS: readonly LayoutSlot[] = ['header', 'body', 'side', 'row', 'intake', 'phone'];

// A field nobody sees: declared, but placed in no slot of the type's layout. The title is drawn by
// the header of every item, so it is never one.
function unplacedNotes(preset: Preset): PresetNote[] {
  const shared = preset.types.length > 1;
  return preset.types.flatMap((type) => {
    const placed = new Set(FIELD_SLOTS.flatMap((slot) => type.layout[slot].map((e) => e.field)));
    return Object.keys(type.fields)
      .filter((field) => field !== 'title' && !placed.has(field))
      .map((field) => {
        const at = field in preset.fields ? 'fields' : `types.${type.name}.fields`;
        const of = shared ? ` of ${type.name}` : '';
        return {
          code: 'field_unplaced' as const,
          level: 'warning' as const,
          message: `${at}.${field}: placed in no layout slot${of} (${FIELD_SLOTS.join(', ')}), so nobody sees it`,
          path: { section: 'fields' as const, type: type.name, field },
        };
      });
  });
}

// Each workflow once, with the type that owns it; the preset's own workflow has no type.
function workflowsOf(preset: Preset): Array<{ workflow: Workflow; type?: ItemType }> {
  const own = preset.types
    .filter((type) => type.workflow !== preset.workflow)
    .map((type) => ({ workflow: type.workflow, type }));
  const shared = preset.types.some((type) => type.workflow === preset.workflow);
  return [...(shared ? [{ workflow: preset.workflow }] : []), ...own];
}

function prefixOf(type: ItemType | undefined): string {
  return type ? `types.${type.name}.workflow` : 'workflow';
}

function scoped(type: ItemType | undefined): { type?: string } {
  return type ? { type: type.name } : {};
}

// How many moves each state lies from the start (the initial or the incomplete state).
function depths(workflow: Workflow): Map<string, number> {
  const entries = [workflow.initial, workflow.incomplete ?? workflow.initial];
  const depth = new Map(entries.map((state) => [state, 0]));
  const queue = [...new Set(entries)];
  for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
    const next = (depth.get(state) ?? 0) + 1;
    for (const { from, to } of workflow.transitions) {
      if (from === state && !depth.has(to)) {
        depth.set(to, next);
        queue.push(to);
      }
    }
  }
  return depth;
}

// A human-turn state is stuck in chat when no decision relayed from chat moves it forward. Chat
// relays only `human` moves (relayableMoves); `human-ui` ones take the web UI. A move is forward
// when its target closes the item as done, or is still open and lies more moves from the start
// than the state itself. Going back, sideways or to a discarded close is not forward: from chat
// the item could then be sent back or thrown away, never advanced.
function stuckNotes(preset: Preset): PresetNote[] {
  return workflowsOf(preset).flatMap(({ workflow, type }) => {
    const depth = depths(workflow);
    const closes = new Map(workflow.states.map(({ name, closes }) => [name, closes]));
    const forward = (from: string, to: string) =>
      closes.get(to) === 'done' ||
      (closes.get(to) === undefined && (depth.get(to) ?? 0) > (depth.get(from) ?? 0));
    return workflow.states
      .filter(({ turn }) => turn === 'human')
      .flatMap(({ name }) => {
        const exits = workflow.transitions.filter(({ from }) => from === name);
        const relayed = exits.filter(({ by }) => by === 'human');
        if (relayed.some(({ to }) => forward(name, to))) return [];
        const at = `${prefixOf(type)}.states.${name}`;
        const targets = (list: typeof exits) => [...new Set(list.map(({ to }) => to))].join(', ');
        const ahead = exits.filter(({ by, to }) => by === 'human-ui' && forward(name, to));
        const message =
          relayed.length === 0
            ? `${at}: turn human, but every way out is human-ui, so a decision relayed from chat cannot move it`
            : `${at}: turn human, but a decision relayed from chat cannot move it forward, only to ${targets(relayed)}${
                ahead.length > 0 ? `; ${targets(ahead)} takes the web UI` : ''
              }`;
        return [
          {
            code: 'state_stuck_in_chat' as const,
            level: 'warning' as const,
            message,
            path: { section: 'states' as const, ...scoped(type), state: name },
          },
        ];
      });
  });
}

// A gate nothing calls. Otea records no gate checks (hooks run otea check but leave no trace), so
// the only sign that a gate is used is the playbook asking the agent to run otea check --gate.
// `playbooks` are the texts of the preset's playbooks; any of them may name any gate.
export function gateNotes(
  preset: Preset,
  playbooks: Readonly<Record<string, string>>,
): PresetNote[] {
  const text = Object.values(playbooks).join('\n');
  const called = (gate: string) => new RegExp(`--gate[ =]${gate}(?![\\w-])`).test(text);
  return workflowsOf(preset).flatMap(({ workflow, type }) =>
    Object.keys(workflow.gates ?? {})
      .filter((gate) => !called(gate))
      .map((gate) => ({
        code: 'gate_unchecked' as const,
        level: 'warning' as const,
        message: `${prefixOf(type)}.gates.${gate}: no playbook of the preset runs otea check --gate ${gate}, and Otea records no gate checks, so nothing may ever stop on it`,
        path: { section: 'gates' as const, ...scoped(type), gate },
      })),
  );
}

// A field only one type of several has: fine when meant, but it reads as missing once an item
// switches type.
function singleTypeNotes(preset: Preset): PresetNote[] {
  if (preset.types.length < 2) return [];
  return preset.types.flatMap((type) =>
    Object.keys(type.fields)
      .filter((field) => preset.types.every((other) => other === type || !(field in other.fields)))
      .map((field) => ({
        code: 'field_single_type' as const,
        level: 'info' as const,
        message: `types.${type.name}.fields.${field}: only ${type.name} has it; it reads as missing when an item switches type`,
        path: { section: 'fields' as const, type: type.name, field },
      })),
  );
}

// The notes the preset's YAML alone shows. The gate check needs the playbooks: it runs only when
// they are given.
export function presetNotes(
  preset: Preset,
  playbooks?: Readonly<Record<string, string>>,
): PresetNote[] {
  return [
    ...unplacedNotes(preset),
    ...stuckNotes(preset),
    ...(playbooks ? gateNotes(preset, playbooks) : []),
    ...singleTypeNotes(preset),
  ];
}
