import type { PresetNote } from '../../../src/core/preset.ts';
import type { Sample } from '../../../src/core/samples.ts';
import { t } from '../i18n/i18n.ts';
import { serverMessage, unreachable } from '../remote.ts';

// Studio's side of the API (src/server/studio.ts), with the shapes it answers.

export type Origin = 'official' | 'project';

export type PresetSummary = {
  name: string;
  origin: Origin;
  version: number | null;
  collections: string[];
  problems: string[];
};

export type PresetSource = {
  name: string;
  origin: Origin;
  editable: boolean;
  version: number | null;
  yaml: string;
  playbooks: Record<string, string>;
  collections: Array<{ name: string; items: number }>;
  problems: string[];
  warnings: string[];
  // Every note on the preset, info ones too, with the part it is about and its file.
  notes: Array<PresetNote & { file: string }>;
};

// A preset's samples (src/core/samples.ts): samples.yaml as written, its samples folder's files,
// and the samples read against the preset as it loaded.
export type PresetSamples = {
  yaml: string | null;
  files: string[];
  samples: Sample[];
  notes: PresetNote[];
};

export type Board = { name: string; preset: string };

export type BlueprintSummary = {
  name: string;
  version: number;
  origin: Origin | 'path';
  boards: Board[];
  connections: string[];
  playbook: string | null;
  warnings: string[];
};

export type BlueprintListing = {
  blueprints: BlueprintSummary[];
  problems: Array<{ blueprint: string; origin: string; message: string }>;
};

export type BlueprintStatus =
  | {
      name: string;
      version: number;
      origin: string | null;
      upToDate: boolean;
      missing?: string;
      changes: string[];
    }
  | { error: string };

export type ProjectBlueprint = {
  name: string;
  version: number;
  boards: Array<Board & { items: number }>;
  connections: string[];
  playbook: string | null;
  status: BlueprintStatus;
};

export type ProjectBlueprintState = { blueprint: ProjectBlueprint | null; problems: string[] };

export type BlueprintEdit = { boards: Board[]; connections: string[]; playbook: string | null };

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    throw new Error(
      body === undefined
        ? t('error.getFailed', { path, status: response.status })
        : serverMessage(body, response.status),
    );
  }
  return response.json() as Promise<T>;
}

export async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    throw new Error(unreachable());
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return body as T;
  throw new Error(serverMessage(body, response.status));
}

const preset = (name: string) => `/api/studio/presets/${encodeURIComponent(name)}`;

export const fetchStudioPresets = (signal: AbortSignal) =>
  get<PresetSummary[]>('/api/studio/presets', signal);

export const fetchPresetSource = (name: string) => (signal: AbortSignal) =>
  get<PresetSource>(preset(name), signal);

export const fetchPresetSamples = (name: string) => (signal: AbortSignal) =>
  get<PresetSamples>(`${preset(name)}/samples`, signal);

// Where the preview loads a sample's file from.
export const sampleFileUrl = (name: string, file: string) =>
  `${preset(name)}/samples/${encodeURIComponent(file)}`;

export const savePreset = (
  name: string,
  yaml: string,
  playbooks: Record<string, string>,
  samples?: string,
) =>
  post<PresetSource>(preset(name), {
    yaml,
    playbooks,
    ...(samples === undefined ? {} : { samples }),
  });

// A blank project preset; and deleting one that no collection uses. Official ones stay.
export const createPreset = (name: string) => post<PresetSource>('/api/studio/presets', { name });

export const deletePreset = (name: string) =>
  post<{ deleted: string }>(`${preset(name)}/delete`, {});

export const duplicatePreset = (name: string, as: string) =>
  post<PresetSource>(`${preset(name)}/duplicate`, { as });

export const fetchBlueprints = (signal: AbortSignal) =>
  get<BlueprintListing>('/api/studio/blueprints', signal);

export const fetchProjectBlueprint = (signal: AbortSignal) =>
  get<ProjectBlueprintState>('/api/studio/blueprint', signal);

export const editBlueprint = (edit: BlueprintEdit) =>
  post<ProjectBlueprintState & { applied: string[] }>('/api/studio/blueprint', edit);

export const applyBlueprint = (name: string) =>
  post<{ boards: Array<Board & { action: string }> }>('/api/studio/blueprint/apply', { name });

// The board's preset copied into the project, and the board pointed at the copy.
export const copyBoardPreset = (board: string, as: string) =>
  post<{ board: string; preset: PresetSource }>(
    `/api/studio/blueprint/boards/${encodeURIComponent(board)}/copy-preset`,
    { as },
  );

export const updateBlueprint = () =>
  post<{ applied: string[]; kept: string[] }>('/api/studio/blueprint/update', {});

// The board's view changed: its preset copied from the official one on first use, then the new YAML.
export const customizeBoard = (board: string, yaml: string) =>
  post<{ preset: string; version: number; previous: string }>(
    `/api/studio/boards/${encodeURIComponent(board)}/customize`,
    { yaml },
  );

export const revertBoard = (board: string, previous: string) =>
  post<unknown>(`/api/studio/boards/${encodeURIComponent(board)}/revert`, { previous });
