import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { boardText } from '../core/board/next.ts';
import { nextStep, playbookSection } from '../core/hint.ts';
import { groupEvidence } from '../core/placement.ts';
import { type ItemType, typeOf } from '../core/preset.ts';
import { listCollections } from '../store/queries.ts';
import { getCollection, presetOf } from './collections.ts';
import type { ItemView } from './items.ts';
import { itemNextText, liveBoardOf } from './next.ts';
import { type LoadedPreset, OFFICIAL_PRESETS_DIR, projectPresetsDir } from './presets.ts';
import type { Project } from './project.ts';
import { openBlockers } from './relations.ts';

// What agents read about a board before acting (`otea board`): a published board's own words for
// them (core/board/next.ts boardText), or, for a collection still on a preset, its playbook. And
// the line `otea show` gives about what to do now with an item.

export type TypePlaybook = { type: string; playbook: string };

// A collection still on a preset: its preset's playbook, read from the preset's directory, or
// nothing when the preset ships none; then each type's own, for the types that have one.
export type CollectionPlaybook = {
  collection: string;
  preset: string;
  playbook: string | null;
  types: TypePlaybook[];
};

// A published board: its live version and what agents read of it.
export type BoardGuide = { collection: string; board: string; version: number; text: string };

export type Guide = ({ kind: 'board' } & BoardGuide) | ({ kind: 'preset' } & CollectionPlaybook);

// `board` is the board's id when the collection is a published board, null on a preset.
export type GuideEntry = {
  name: string;
  board: string | null;
  preset: string;
  command: string;
};

function presetDir(project: Project, preset: LoadedPreset): string {
  const base =
    preset.origin === 'official' ? OFFICIAL_PRESETS_DIR : projectPresetsDir(project.dataDir);
  return join(base, preset.name);
}

// `path` is the preset's playbook, or a type's: both are read from the preset's directory.
export function playbookText(
  project: Project,
  preset: LoadedPreset,
  path = preset.playbook,
): string | null {
  if (path === undefined) return null;
  return readFileSync(resolve(presetDir(project, preset), path), 'utf8');
}

// The section for the state in the type's own playbook, or else in the preset's.
function sectionFor(project: Project, preset: LoadedPreset, type: ItemType, state: string) {
  for (const path of [type.playbook, preset.playbook]) {
    const playbook = playbookText(project, preset, path);
    const section = playbook === null ? undefined : playbookSection(playbook, state);
    if (section !== undefined) return section;
  }
  return undefined;
}

// What `otea show` says to do now with the item: next's text on a board; on a preset, the line its
// workflow and playbook give.
export function hintFor(project: Project, item: ItemView, me: string): string {
  const onBoard = itemNextText(project, item, me);
  if (onBoard !== undefined) return onBoard;
  const preset = presetOf(project, getCollection(project.db, item.collection));
  const type = typeOf(preset, item.type);
  const { workflow, layout } = type;
  const section = sectionFor(project, preset, type, item.state);
  const emptyRequired = groupEvidence(layout, item.evidence)
    .modules.filter(({ module, evidence }) => module.required && evidence.length === 0)
    .map(({ module }) => module.id);
  const input = {
    state: item.state,
    lease: item.lease,
    missing: item.missing,
    emptyRequired,
    openChildren: item.children?.open ?? 0,
    openBlockers: openBlockers(item.relations),
    ...(section === undefined ? {} : { section }),
  };
  return nextStep(workflow, input, me);
}

export function collectionPlaybook(project: Project, name: string): CollectionPlaybook {
  const collection = getCollection(project.db, name);
  const preset = presetOf(project, collection);
  const types = preset.types.flatMap(({ name: type, playbook: path }) => {
    const playbook = path === undefined ? null : playbookText(project, preset, path);
    return playbook === null ? [] : [{ type, playbook }];
  });
  return {
    collection: name,
    preset: preset.name,
    playbook: playbookText(project, preset),
    types,
  };
}

export function guideCommand(collection: string): string {
  return /^[\w.-]+$/.test(collection) ? `otea board ${collection}` : `otea board "${collection}"`;
}

export function boardGuide(project: Project, name: string): Guide {
  const board = liveBoardOf(project, getCollection(project.db, name).name);
  if (!board) return { kind: 'preset', ...collectionPlaybook(project, name) };
  return {
    kind: 'board',
    collection: name,
    board: board.id,
    version: board.version,
    text: boardText(board.def),
  };
}

// The project's collections, each with its board (or preset) and how to read what its agents do.
export function guideIndex(project: Project): GuideEntry[] {
  return listCollections(project.db).map(({ name, preset }) => ({
    name,
    board: liveBoardOf(project, name)?.id ?? null,
    preset,
    command: guideCommand(name),
  }));
}
