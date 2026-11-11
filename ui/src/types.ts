import type { Layout } from '../../src/core/modules.ts';
import type { FieldRequirement, Labels } from '../../src/core/preset.ts';
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
  // A lease that ran out with nobody releasing it; lease is null then.
  expiredLease?: Lease;
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
// the item closed; `blockers_closed`: everything that blocks it closed).
export type Move = {
  to: string;
  by: Authority;
  reasonRequired: boolean;
  turn: Turn;
  closes?: Closing;
  requires?: ('children_closed' | 'blockers_closed')[];
};

// requires: what entering the state waits for, as the preset declares it.
export type State = {
  name: string;
  turn: Turn;
  closes?: Closing;
  requires?: Array<'blockers_closed' | 'children_closed'>;
};

export type EvidenceRole = 'before' | 'after' | 'single';

export type EvidenceKind = 'image' | 'video' | 'diff' | 'log' | 'diagram' | 'file';

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
  // Which gated actions (otea check) its state allows, when its workflow gates any.
  gates?: Record<string, boolean>;
};

// canManageDevices: this computer's signed-in browser, the only one that pairs and revokes devices.
// canConfigure: the same browser; it alone changes the project's paths, presets and blueprint.
export type Session = { canWrite: boolean; canManageDevices?: boolean; canConfigure?: boolean };

// A phone or tablet paired over the LAN; hint is the end of its token's hash.
export type Device = {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt: string | null;
  hint: string;
};

// LAN access as the desk sees it: off unless otea serve --lan; the code while one is good.
export type LanView = {
  enabled: boolean;
  urls: string[];
  code: {
    code: string;
    expiresAt: string;
    url: string;
    qr: { size: number; cells: boolean[][] };
  } | null;
  devices: Device[];
};

export type PairingPeek = { project: string; expiresAt: string };

export type Paired = { project: string; device: Device };

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
  label?: string;
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
  // Every move of its workflow, in declared order (the main path reads it); absent from an older server.
  transitions?: { from: string; to: string; by: Authority; reasonRequired: boolean }[];
  fields: FieldView[];
  layout: Layout;
  // Set only in a preset that declares a hierarchy: the types it takes as children, and whether it
  // may live with no parent.
  children?: string[];
  root?: boolean;
  // The actions its workflow gates (push, merge) and the states that allow each, when it has any.
  gates?: Record<string, string[]>;
  // Its words in the other languages its preset speaks, by language (see preset-words.ts).
  labels?: Labels;
};

// How a collection lists its items: the list or the grid (a board is drawn as the list), its
// grouping, and the grid's columns, in order.
export type ViewSpec = { kind: 'list' | 'board' | 'grid'; groupBy: string; columns: string[] };

export type CollectionView = {
  name: string;
  prefix: string;
  preset: string;
  types: TypeView[];
  view: ViewSpec;
  // The icon it shows (a name in the UI catalog), resolved by the server; null for none.
  icon: string | null;
};

// The project this server serves. icon: the name of its icon, null for its monogram.
export type ProjectView = { id: string; name: string; icon: string | null };

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

export type PathKind = 'folder' | 'repo';

export type ProjectPath = { path: string; kind: PathKind; missing: boolean };

// An item waiting for you in some project, with its type's icon there.
export type WaitingItem = Item & { icon?: string };

// A project on this machine, as the projects inbox reads it (GET /api/projects).
export type ProjectOverview = {
  id: string;
  name: string;
  storage: 'common' | 'local';
  // The project this server serves.
  current: boolean;
  paths: ProjectPath[];
  waiting: WaitingItem[];
  withAgents: number;
  open: number;
  // The address of the otea serve that shows it, when that is another server.
  served?: string;
  unavailable?: string;
};

export type GateKind = 'hard' | 'soft';

export type RepoSettings = { name: string; folder: string; gate: GateKind; items: number };

export type ProjectSettings = {
  id: string;
  name: string;
  storage: 'common' | 'local';
  root: string;
  dataDir: string;
  registered: boolean;
  database: { path: string; bytes: number };
  evidence: { path: string; bytes: number; files: number };
  items: number;
  collections: Array<{ name: string; preset: string }>;
  paths: Array<ProjectPath & { repos: RepoSettings[] }>;
};
