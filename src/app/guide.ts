import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nextStep, playbookSection } from '../core/hint.ts';
import { groupEvidence } from '../core/placement.ts';
import { type ItemType, typeOf } from '../core/preset.ts';
import { listCollections } from '../store/queries.ts';
import { getCollection, presetOf } from './collections.ts';
import type { ItemView } from './items.ts';
import { type LoadedPreset, OFFICIAL_PRESETS_DIR, projectPresetsDir } from './presets.ts';
import type { Project } from './project.ts';
import { openBlockers } from './relations.ts';

// The playbook a collection's agents follow: its preset's, read from the preset's directory, or
// nothing when the preset ships none; then each type's own, for the types that have one.
export type TypePlaybook = { type: string; playbook: string };

export type CollectionPlaybook = {
  collection: string;
  preset: string;
  playbook: string | null;
  types: TypePlaybook[];
};

export type PlaybookEntry = { name: string; preset: string; command: string };

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

// The line `otea show` gives the agent about what to do now with the item.
export function hintFor(project: Project, item: ItemView, me: string): string {
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

export function playbookCommand(collection: string): string {
  return `otea playbook --collection ${collection}`;
}

// The project's collections, each with its preset and how to read its playbook.
export function playbookIndex(project: Project): PlaybookEntry[] {
  return listCollections(project.db).map(({ name, preset }) => ({
    name,
    preset,
    command: playbookCommand(name),
  }));
}
