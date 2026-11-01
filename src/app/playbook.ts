import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nextStep, playbookSection } from '../core/hint.ts';
import { groupEvidence } from '../core/placement.ts';
import { typeOf } from '../core/preset.ts';
import { listCollections } from '../store/queries.ts';
import { getCollection, presetOf } from './collections.ts';
import type { ItemView } from './items.ts';
import { type LoadedPreset, OFFICIAL_PRESETS_DIR } from './presets.ts';
import type { Project } from './project.ts';

// The playbook a collection's agents follow: its preset's, read from the preset's directory, or
// nothing when the preset ships none.
export type CollectionPlaybook = { collection: string; preset: string; playbook: string | null };

export type PlaybookEntry = { name: string; preset: string; command: string };

function presetDir(project: Project, preset: LoadedPreset): string {
  const base =
    preset.origin === 'official' ? OFFICIAL_PRESETS_DIR : join(project.root, '.otea', 'presets');
  return join(base, preset.name);
}

export function playbookText(project: Project, preset: LoadedPreset): string | null {
  if (preset.playbook === undefined) return null;
  return readFileSync(resolve(presetDir(project, preset), preset.playbook), 'utf8');
}

// The line `otea show` gives the agent about what to do now with the item.
export function hintFor(project: Project, item: ItemView, me: string): string {
  const preset = presetOf(project, getCollection(project.db, item.collection));
  const { workflow, layout } = typeOf(preset, item.type);
  const playbook = playbookText(project, preset);
  const section = playbook === null ? undefined : playbookSection(playbook, item.state);
  const emptyRequired = groupEvidence(layout, item.evidence)
    .modules.filter(({ module, evidence }) => module.required && evidence.length === 0)
    .map(({ module }) => module.id);
  const input = {
    state: item.state,
    lease: item.lease,
    missing: item.missing,
    emptyRequired,
    openChildren: item.children?.open ?? 0,
    ...(section === undefined ? {} : { section }),
  };
  return nextStep(workflow, input, me);
}

export function collectionPlaybook(project: Project, name: string): CollectionPlaybook {
  const collection = getCollection(project.db, name);
  const preset = presetOf(project, collection);
  return { collection: name, preset: preset.name, playbook: playbookText(project, preset) };
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
