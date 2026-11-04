import {
  type Blueprint,
  blocksWaitingForNothing,
  type Connection,
  connectionText,
} from '../../../src/core/blueprint.ts';
import type { PresetView, TypeView } from '../types.ts';
import type { BlueprintDraft } from './blueprint.ts';
import { rawOf } from './draft.ts';
import { setRequires } from './lanes-edit.ts';

// What a link does to the gate of its target: a blocks link holds the target in the state that
// requires blockers_closed, or, when no state does, waits for nothing (the core's finding, as otea
// validate reports it). Its fix makes a state of the target wait, in the target board's preset; an
// official preset is first copied into the project, since it is only read where it is.

export type Fix = {
  board: string;
  preset: string;
  type: string;
  state: string;
  // Set when the preset is official: the name of the project copy the board moves to.
  copy?: string;
};

export type Gate =
  | { kind: 'waits'; state: string }
  | { kind: 'nothing'; fix: Fix | undefined }
  | { kind: 'pointer' };

const typeOf = (
  draft: BlueprintDraft,
  presets: readonly PresetView[],
  end: { board: string; type: string },
) => {
  const preset = presets.find(
    ({ name }) => name === draft.boards.find(({ name: board }) => board === end.board)?.preset,
  );
  return { preset, type: preset?.types.find(({ name }) => name === end.type) };
};

// The links of the draft that wait for nothing, by their text, as the core finds them.
export function nothingWaits(
  name: string,
  draft: BlueprintDraft,
  connections: readonly Connection[],
  presets: readonly PresetView[],
): Set<string> {
  const blueprint: Blueprint = {
    name,
    version: 1,
    boards: draft.boards,
    connections: [...connections],
  };
  const found = blocksWaitingForNothing(blueprint, (board, type) => {
    const view = typeOf(draft, presets, { board, type }).type;
    return view && { states: view.states };
  });
  return new Set(found.map(({ connection }) => connectionText(connection)));
}

// The state a fix makes wait: the first open one past the initial state, where work starts.
export function waitStateFor(type: TypeView | undefined): string | undefined {
  const states = type?.states ?? [];
  const start = states.findIndex(({ name }) => name === type?.initial);
  return states.find(
    (state, index) =>
      index > start && state.name !== type?.incomplete && state.closes === undefined,
  )?.name;
}

// A project copy's name: the blueprint's and the preset's, numbered while a preset has it.
export function copyName(blueprint: string, preset: string, taken: readonly string[]): string {
  const base = `${blueprint}-${preset}`;
  let name = base;
  for (let count = 2; taken.includes(name); count += 1) name = `${base}-${count}`;
  return name;
}

export function gateOf(
  link: Connection,
  blueprint: string,
  draft: BlueprintDraft,
  presets: readonly PresetView[],
): Gate {
  if (link.kind !== 'blocks') return { kind: 'pointer' };
  const { preset, type } = typeOf(draft, presets, link.to);
  if (!nothingWaits(blueprint, draft, [link], presets).has(connectionText(link))) {
    const state = type?.states.find(({ requires }) => requires?.includes('blockers_closed'));
    return { kind: 'waits', state: state?.name ?? '' };
  }
  const state = waitStateFor(type);
  if (!preset || !type || !state) return { kind: 'nothing', fix: undefined };
  const fix: Fix = { board: link.to.board, preset: preset.name, type: type.name, state };
  if (preset.origin === 'official') {
    fix.copy = copyName(
      blueprint,
      preset.name,
      presets.map(({ name }) => name),
    );
  }
  return { kind: 'nothing', fix };
}

// The preset's YAML with the fix's state requiring blockers_closed: the draft the fix opens.
export function waitingDraft(yaml: string, type: string, state: string): string {
  return setRequires(yaml, rawOf(yaml), type, state, 'blockers_closed', true);
}
