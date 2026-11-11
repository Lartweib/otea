import { availableMoves, type Move, type Performer, relayableMoves } from './authority.ts';
import { type EvidenceKind, type EvidenceRole, evidenceTypeOf } from './evidence.ts';
import { missingToComplete } from './fields.ts';
import type { Actor } from './item.ts';
import { prefixFor } from './item.ts';
import type { Layout } from './modules.ts';
import { holderOf } from './placement.ts';
import type { CollectionLayout, FieldSpec, ItemType, Labels, Preset } from './preset.ts';
import { type ChildrenSummary, childrenSummary, type RelationView } from './relations.ts';
import type { Sample, SampleEvent } from './samples.ts';
import type { Transition } from './workflow.ts';
import { type Closing, gateVerdicts, type State, type Turn, type Workflow } from './workflow.ts';

// The views clients draw, built from a preset alone: the server builds them from the presets it
// loaded and the items it stores, Studio's preview from a draft and its samples, with the same code.

export type FieldView = FieldSpec & { name: string };

// A type as clients see it: its fields in order, where its items start, its states (whose turn
// each is and how the closed ones close), its layout, and its icon when the preset gives it one.
// In a preset that declares a hierarchy, `children` are the types it takes under it and `root`
// whether it may live with no parent; elsewhere neither is set, and any type takes any child.
// `labels` are the type's words in the other languages its preset speaks, for the web UI to show.
export type TypeView = {
  name: string;
  label: string;
  icon?: string;
  initial: string;
  incomplete?: string;
  states: State[];
  // Every move of its workflow, in the order the preset declares them: what its main path reads.
  transitions: Transition[];
  fields: FieldView[];
  layout: Layout;
  children?: string[];
  root?: boolean;
  // The actions its workflow gates and the states that allow each, when it declares any.
  gates?: Record<string, string[]>;
  labels?: Labels;
};

export function fieldViews(fields: Record<string, FieldSpec>): FieldView[] {
  return Object.entries(fields).map(([name, spec]) => ({ name, ...spec }));
}

export function typeViews(types: readonly ItemType[]): TypeView[] {
  return types.map(({ name, label, icon, fields, workflow, layout, children, root, labels }) => {
    const view: TypeView = {
      name,
      label,
      initial: workflow.initial,
      states: workflow.states,
      transitions: workflow.transitions,
      fields: fieldViews(fields),
      layout,
    };
    if (workflow.incomplete !== undefined) view.incomplete = workflow.incomplete;
    if (icon !== undefined) view.icon = icon;
    if (children !== undefined) view.children = children;
    if (root !== undefined) view.root = root;
    if (workflow.gates !== undefined && Object.keys(workflow.gates).length > 0) {
      view.gates = workflow.gates;
    }
    if (labels !== undefined) view.labels = labels;
    return view;
  });
}

// `icon` is resolved: the collection's own or its preset's, so clients never resolve it.
export type CollectionView = {
  name: string;
  prefix: string;
  preset: string;
  icon: string | null;
  types: TypeView[];
  view: CollectionLayout;
};

// A collection of a draft preset, for the preview: named as given, with the preset's icon unless
// it is given its own.
export function draftCollectionView(
  preset: Preset,
  { name, icon }: { name: string; icon?: string | null },
): CollectionView {
  return {
    name,
    prefix: prefixFor(name),
    preset: preset.name,
    icon: icon === undefined ? (preset.icon ?? null) : icon,
    types: typeViews(preset.types),
    view: preset.view,
  };
}

// What an item in a state offers: the moves the performer may make, the human decisions an agent
// may relay, the fields it still lacks to complete, and, when its workflow gates actions, which
// ones its state allows.
export type ItemMoves = {
  transitions: Move[];
  relayable: Move[];
  missing: string[];
  gates?: Record<string, boolean>;
};

export function itemMoves(
  type: ItemType,
  state: string,
  fields: Record<string, unknown>,
  performer: Performer,
): ItemMoves {
  const gates = gateVerdicts(type.workflow, state);
  return {
    transitions: availableMoves(type.workflow, state, performer),
    relayable: relayableMoves(type.workflow, state),
    missing: missingToComplete(type, fields),
    ...(Object.keys(gates).length > 0 ? { gates } : {}),
  };
}

// The shapes of a stored item as the server sends it (src/app/items.ts), which a sample takes.
export type ViewLease = { holder: string; expiresAt: string };

export type ViewItem = {
  id: string;
  collection: string;
  seq: number;
  type: string;
  title: string;
  fields: Record<string, string>;
  presetVersion: number;
  state: string;
  turn: Turn;
  closes?: Closing;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  lease: ViewLease | null;
  children?: ChildrenSummary;
};

export type ViewEvent = {
  id: number;
  itemId: string;
  type: string;
  actor: Actor;
  at: string;
  data: Record<string, unknown>;
};

export type ViewEvidence = {
  id: number;
  itemId: string;
  role: EvidenceRole;
  module: string | null;
  kind: EvidenceKind;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  caption: string | null;
  createdAt: string;
  actor: Actor;
  channel: 'cli' | 'mcp' | 'ui';
};

export type ViewRelated = {
  kind: RelationView;
  id: string;
  collection: string;
  type: string;
  title: string;
  state: string;
  turn: Turn;
  closes?: Closing;
  lease: ViewLease | null;
};

export type ItemView = ViewItem &
  ItemMoves & { events: ViewEvent[]; evidence: ViewEvidence[]; relations: ViewRelated[] };

// `collection` names the collection the preview draws the sample in; `now` is when it is drawn,
// which a sample's `ago` counts back from; `performer` is who looks, the desk's browser by default.
export type SampleViewOptions = { collection: string; now: string; performer?: Performer };

const DESK: Performer = { actor: { kind: 'human', name: 'you' }, channel: 'ui' };

const UNITS: Readonly<Record<string, number>> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

function before(now: string, ago: string | undefined): string {
  if (ago === undefined) return now;
  const unit = UNITS[ago.slice(-1)] ?? 0;
  return new Date(Date.parse(now) - Number(ago.slice(0, -1)) * unit).toISOString();
}

function typeIn(preset: Preset, name: string): ItemType {
  const type = preset.types.find((candidate) => candidate.name === name) ?? preset.types[0];
  if (!type) throw new Error(`Preset ${preset.name} has no types`);
  return type;
}

function stateOf(workflow: Workflow, name: string): State | undefined {
  return workflow.states.find((state) => state.name === name);
}

// A sample's sequence number: the end of its id (BUGS-12 is 12), or 1.
function seqOf(id: string): number {
  const digits = /(\d+)$/.exec(id)?.[1];
  return digits === undefined ? 1 : Number(digits);
}

function actorOf(event: SampleEvent): Actor {
  return { kind: event.actor, name: event.name };
}

// The other end of a sample's link: its turn read from the preset when it is one of its types in
// one of its states, else the agent's (it lives nowhere the preview can look).
function relatedOf(preset: Preset, sample: Sample): ViewRelated[] {
  return sample.relations.map((relation) => {
    const workflow = preset.types.find(({ name }) => name === relation.type)?.workflow;
    const state = workflow && stateOf(workflow, relation.state ?? '');
    const related: ViewRelated = {
      kind: relation.kind,
      id: relation.id,
      collection: relation.id.replace(/-\d+$/, '').toLowerCase(),
      type: relation.type ?? '',
      title: relation.title,
      state: relation.state ?? '',
      turn: state?.turn ?? 'agent',
      lease: null,
    };
    if (state?.closes !== undefined) related.closes = state.closes;
    return related;
  });
}

// A sample as a stored item reads in a list: what the row, the lanes and the grid draw.
export function sampleItem(preset: Preset, sample: Sample, options: SampleViewOptions): ViewItem {
  const type = typeIn(preset, sample.type);
  const state =
    stateOf(type.workflow, sample.state) ?? stateOf(type.workflow, type.workflow.initial);
  const times = sample.history.map(({ ago }) => before(options.now, ago));
  const first = sample.history[0];
  const item: ViewItem = {
    id: sample.id,
    collection: options.collection,
    seq: seqOf(sample.id),
    type: type.name,
    title: sample.title,
    fields: sample.fields,
    presetVersion: preset.version,
    state: state?.name ?? type.workflow.initial,
    turn: state?.turn ?? 'agent',
    createdAt: times[0] ?? options.now,
    updatedAt: times.at(-1) ?? options.now,
    createdBy: first ? actorOf(first) : DESK.actor,
    lease: null,
  };
  if (state?.closes !== undefined) item.closes = state.closes;
  const children = relatedOf(preset, sample).filter(({ kind }) => kind === 'child');
  if (children.length > 0) item.children = childrenSummary(children);
  return item;
}

// A sample as the item detail reads it, as GET /api/items/:id answers for a stored item.
export function sampleItemView(
  preset: Preset,
  sample: Sample,
  options: SampleViewOptions,
): ItemView {
  const item = sampleItem(preset, sample, options);
  const type = typeIn(preset, item.type);
  const events = sample.history.map(
    (event, index): ViewEvent => ({
      id: index + 1,
      itemId: item.id,
      type: event.event,
      actor: actorOf(event),
      at: before(options.now, event.ago),
      data: {
        ...(event.event === 'created' ? { state: item.state } : {}),
        ...(event.from === undefined ? {} : { from: event.from }),
        ...(event.to === undefined ? {} : { to: event.to }),
        ...(event.reason === undefined ? {} : { reason: event.reason }),
      },
    }),
  );
  const evidence = sample.evidence.map(
    ({ file, role, module, caption }, index): ViewEvidence => ({
      id: index + 1,
      itemId: item.id,
      role,
      module: holderOf(type.layout, { module: module ?? null, filename: file }),
      ...evidenceTypeOf(file),
      filename: file,
      size: 0,
      sha256: '',
      caption: caption ?? null,
      createdAt: item.createdAt,
      actor: item.createdBy,
      channel: 'cli',
    }),
  );
  return {
    ...item,
    events,
    ...itemMoves(type, item.state, item.fields, options.performer ?? DESK),
    evidence,
    relations: relatedOf(preset, sample),
  };
}
