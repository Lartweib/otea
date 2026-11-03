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
};

export type Board = { name: string; preset: string };

export type BlueprintSummary = {
  name: string;
  version: number;
  origin: Origin | 'path';
  boards: Board[];
  connections: string[];
  playbook: string | null;
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

async function post<T>(path: string, payload: unknown): Promise<T> {
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

export const savePreset = (name: string, yaml: string, playbooks: Record<string, string>) =>
  post<PresetSource>(preset(name), { yaml, playbooks });

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

export const updateBlueprint = () =>
  post<{ applied: string[]; kept: string[] }>('/api/studio/blueprint/update', {});
