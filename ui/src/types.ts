import type { Layout } from '../../src/core/modules.ts';
import type { FieldRequirement } from '../../src/core/preset.ts';
import type { ChildrenSummary, RelationRef, RelationView } from '../../src/core/relations.ts';

// Relation kinds and how they read from either item, from the core. Type-only.
export type {
  ChildrenSummary,
  RelationKind,
  RelationRef,
  RelationView,
} from '../../src/core/relations.ts';

export type Turn = 'human' | 'agent' | 'none';

export type Actor = { kind: 'human' | 'agent'; name: string };

export type Lease = { holder: string; expiresAt: string };

// How a closed state closes an item: its work was done, or thrown away.
export type Closing = 'done' | 'discarded';

export type Item = {
  id: string;
  collection: string;
  // The item type: "item" in a collection whose preset declares no types.
  type: string;
  title: string;
  fields: Record<string, string>;
  presetVersion: number;
  state: string;
  turn: Turn;
  // Set once the item is in a closed state (turn none), from that state's `closes`.
  closes?: Closing;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  lease: Lease | null;
  // The item's relations, read from it, and a parent's children summary; absent when it has none.
  relations?: RelationRef[];
  children?: ChildrenSummary;
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

// turn: whose turn the item is on once the move lands; closes: how a move into a closed state closes it;
// requires: what entering the state waits for, whatever its turn (`children_closed`: every child of
// the item closed).
export type Move = {
  to: string;
  by: Authority;
  reasonRequired: boolean;
  turn: Turn;
  closes?: Closing;
  requires?: 'children_closed';
};

export type State = { name: string; turn: Turn; closes?: Closing };

export type EvidenceRole = 'before' | 'after' | 'single';

export type EvidenceKind = 'image' | 'video' | 'diff' | 'log' | 'file';

// A file an agent attached as proof. Before/after carry no pair id: the latest of each pair up.
export type Evidence = {
  id: number;
  itemId: string;
  role: EvidenceRole;
  // The id of the layout module that draws it; null when none does.
  module: string | null;
  kind: EvidenceKind;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  caption: string | null;
  createdAt: string;
  actor: Actor;
  channel: string;
};

// A relation as the detail lists it: how it reads from the item, and where the other item stands.
export type RelatedItem = {
  kind: RelationView;
  id: string;
  collection: string;
  type: string;
  title: string;
  state: string;
  turn: Turn;
  closes?: Closing;
  lease: Lease | null;
};

// relayable: the human decisions an agent may relay from the current state.
export type ItemView = Omit<ItemWithEvents, 'relations'> & {
  transitions: Move[];
  relayable: Move[];
  missing: string[];
  evidence: Evidence[];
  relations: RelatedItem[];
};

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

// Where a type's layout places modules, from the core preset format. Type-only.
export type { Layout, LayoutEntry, LayoutSlot } from '../../src/core/modules.ts';

// A type of a collection's preset: its fields, where its items start and its layout.
export type TypeView = {
  name: string;
  label: string;
  // The name of its icon in the UI catalog (ui/src/icons/); none when the preset gives it none.
  icon?: string;
  initial: string;
  incomplete?: string;
  states: State[];
  fields: FieldView[];
  layout: Layout;
};

// How a collection lists its items. Only a list grouped by turn is drawn yet: every other kind and
// grouping falls back to it.
export type ViewSpec = { kind: 'list' | 'board' | 'grid'; groupBy: string };

export type CollectionView = {
  name: string;
  prefix: string;
  preset: string;
  types: TypeView[];
  view: ViewSpec;
};

export type PresetOrigin = 'official' | 'project';

export type PresetView = {
  name: string;
  version: number;
  origin: PresetOrigin;
  fields: FieldView[];
  types: TypeView[];
  view: ViewSpec;
  collections: string[];
};
