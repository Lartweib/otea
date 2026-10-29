import type { FieldRequirement } from '../../src/core/preset.ts';

export type Turn = 'human' | 'agent' | 'none';

export type Actor = { kind: 'human' | 'agent'; name: string };

export type Lease = { holder: string; expiresAt: string };

export type Item = {
  id: string;
  collection: string;
  title: string;
  fields: Record<string, string>;
  presetVersion: number;
  state: string;
  turn: Turn;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  lease: Lease | null;
};

export type ItemEvent = {
  id: number;
  type: string;
  actor: Actor;
  at: string;
  data: Record<string, unknown>;
};

export type ItemWithEvents = Item & { events: ItemEvent[] };

export type Authority = 'agent' | 'human' | 'human-ui';

// turn: whose turn the item is on once the move lands.
export type Move = { to: string; by: Authority; reasonRequired: boolean; turn: Turn };

export type ItemView = ItemWithEvents & { transitions: Move[]; missing: string[] };

export type Session = { canWrite: boolean };

// Module names have one source, the core preset format. Type-only: nothing from src/ is bundled.
export type { FieldModule, FieldRequirement } from '../../src/core/preset.ts';

// A field as the server sends it. `module` stays a string: a newer server or a local module can
// name a module this UI build does not know, and the registry falls back to plain text for it.
export type FieldView = {
  name: string;
  module: string;
  required?: FieldRequirement;
  values?: string[];
  default?: string;
};

export type CollectionView = {
  name: string;
  prefix: string;
  preset: string;
  initial: string;
  incomplete?: string;
  fields: FieldView[];
};

export type PresetOrigin = 'official' | 'project';

export type PresetView = {
  name: string;
  version: number;
  origin: PresetOrigin;
  fields: FieldView[];
  collections: string[];
};
