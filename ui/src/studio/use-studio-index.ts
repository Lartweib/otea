import { type Connection, useRemote } from '../hooks.ts';
import type { Remote } from '../remote.ts';
import {
  fetchProjectBlueprint,
  fetchStudioPresets,
  type PresetSummary,
  type ProjectBlueprintState,
} from './api.ts';

export type StudioIndex = {
  presets: Remote<PresetSummary[]>;
  blueprint: Remote<ProjectBlueprintState>;
};

// Nothing to load away from Studio: the last answer stays as it was until Studio opens again.
const idle = () => new Promise<never>(() => undefined);

// What Studio's index lists (its presets and the project's blueprint), read once for both Studio
// and the sidebar's tree under it, and only while either shows it.
export function useStudioIndex(
  active: boolean,
  version: number,
  connection: Connection,
): StudioIndex {
  const presets = useRemote<PresetSummary[]>(
    active ? fetchStudioPresets : idle,
    version,
    connection,
  );
  const blueprint = useRemote<ProjectBlueprintState>(
    active ? fetchProjectBlueprint : idle,
    version,
    connection,
  );
  return { presets, blueprint };
}
