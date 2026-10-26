import { readFileSync } from 'node:fs';
import { parsePreset } from './preset.ts';

const TASKS_PRESET = new URL('../../presets/tasks/preset.yaml', import.meta.url);

export const tasksPreset = parsePreset(readFileSync(TASKS_PRESET, 'utf8'));

export const tasks = tasksPreset.workflow;
