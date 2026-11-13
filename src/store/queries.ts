import type { DatabaseSync } from 'node:sqlite';
import type { Channel } from '../core/authority.ts';
import type { EvidenceKind, EvidenceRole } from '../core/evidence.ts';
import type { Actor } from '../core/item.ts';
import type { Lease } from '../core/lease.ts';
import { modelFamily, type Profile } from '../core/profile.ts';
import type { Relation, RelationKind } from '../core/relations.ts';

export type CollectionRecord = {
  name: string;
  prefix: string;
  preset: string;
  presetVersion: number;
  nextSeq: number;
  // The icon given to the collection itself, or null to show its preset's.
  icon: string | null;
};

type CollectionRow = {
  name: string;
  prefix: string;
  preset: string;
  preset_version: number;
  next_seq: number;
  icon: string | null;
};

function toCollection(row: CollectionRow): CollectionRecord {
  return {
    name: row.name,
    prefix: row.prefix,
    preset: row.preset,
    presetVersion: row.preset_version,
    nextSeq: row.next_seq,
    icon: row.icon,
  };
}

export function insertCollection(db: DatabaseSync, collection: CollectionRecord): void {
  db.prepare(
    'INSERT INTO collections (name, prefix, preset, preset_version, next_seq, icon) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    collection.name,
    collection.prefix,
    collection.preset,
    collection.presetVersion,
    collection.nextSeq,
    collection.icon,
  );
}

export function updateCollectionIcon(db: DatabaseSync, name: string, icon: string | null): void {
  db.prepare('UPDATE collections SET icon = ? WHERE name = ?').run(icon, name);
}

// A collection moves to another preset of the same types and states: its items are read under the
// new one from now on, as written under its current version.
export function setCollectionPreset(
  db: DatabaseSync,
  name: string,
  preset: string,
  version: number,
): void {
  db.prepare('UPDATE collections SET preset = ?, preset_version = ? WHERE name = ?').run(
    preset,
    version,
    name,
  );
  db.prepare('UPDATE items SET preset_version = ? WHERE collection = ?').run(version, name);
}

// A collection by its name, or by the same name in another case: a collection is a board, whose
// name is unique whatever its case, so `tareas` is Tareas.
export function findCollection(db: DatabaseSync, name: string): CollectionRecord | undefined {
  const row = db.prepare('SELECT * FROM collections WHERE name = ?').get(name);
  if (row) return toCollection(row as CollectionRow);
  const folded = name.trim().toLocaleLowerCase();
  const same = listCollections(db).filter((each) => each.name.toLocaleLowerCase() === folded);
  return same.length === 1 ? same[0] : undefined;
}

export function listCollections(db: DatabaseSync): CollectionRecord[] {
  const rows = db.prepare('SELECT * FROM collections').all() as CollectionRow[];
  return rows.map(toCollection);
}

// Only a collection without items may go: nothing else refers to it.
export function deleteCollection(db: DatabaseSync, name: string): void {
  db.prepare('DELETE FROM collections WHERE name = ?').run(name);
}

export function collectionTaken(db: DatabaseSync, name: string, prefix: string): boolean {
  const sql = 'SELECT 1 FROM collections WHERE name = ? OR prefix = ?';
  return db.prepare(sql).get(name, prefix) !== undefined;
}

export function claimNextSeq(db: DatabaseSync, collection: string): number {
  const sql = 'UPDATE collections SET next_seq = next_seq + 1 WHERE name = ? RETURNING next_seq';
  return Number(db.prepare(sql).get(collection)?.next_seq) - 1;
}

export type ItemRecord = {
  id: string;
  collection: string;
  seq: number;
  type: string;
  title: string;
  fields: Record<string, unknown>;
  presetVersion: number;
  state: string;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  lease: Lease | null;
};

type ItemRow = {
  id: string;
  collection: string;
  seq: number;
  type: string;
  title: string;
  fields: string;
  preset_version: number;
  state: string;
  created_at: string;
  updated_at: string;
  created_by_kind: Actor['kind'];
  created_by_name: string;
  lease_holder: string | null;
  lease_expires_at: string | null;
};

function toItem(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    collection: row.collection,
    seq: row.seq,
    type: row.type,
    title: row.title,
    fields: JSON.parse(row.fields) as Record<string, unknown>,
    presetVersion: row.preset_version,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: { kind: row.created_by_kind, name: row.created_by_name },
    lease:
      row.lease_holder === null || row.lease_expires_at === null
        ? null
        : { holder: row.lease_holder, expiresAt: row.lease_expires_at },
  };
}

export function insertItem(db: DatabaseSync, item: ItemRecord): void {
  db.prepare(
    `INSERT INTO items (id, collection, seq, type, title, fields, preset_version, state,
      created_at, updated_at, created_by_kind, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id,
    item.collection,
    item.seq,
    item.type,
    item.title,
    JSON.stringify(item.fields),
    item.presetVersion,
    item.state,
    item.createdAt,
    item.updatedAt,
    item.createdBy.kind,
    item.createdBy.name,
  );
}

export function findItem(db: DatabaseSync, id: string): ItemRecord | undefined {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  return row && toItem(row as ItemRow);
}

export type ItemFilter = { collection?: string; state?: string; type?: string };

export function selectItems(db: DatabaseSync, filter: ItemFilter): ItemRecord[] {
  const sql = `SELECT * FROM items
    WHERE (:collection IS NULL OR collection = :collection) AND (:state IS NULL OR state = :state)
      AND (:type IS NULL OR type = :type)
    ORDER BY created_at, rowid`;
  const params = {
    collection: filter.collection ?? null,
    state: filter.state ?? null,
    type: filter.type ?? null,
  };
  return (db.prepare(sql).all(params) as ItemRow[]).map(toItem);
}

export function hasItemsOfType(db: DatabaseSync, collection: string, type: string): boolean {
  const sql = 'SELECT 1 FROM items WHERE collection = ? AND type = ? LIMIT 1';
  return db.prepare(sql).get(collection, type) !== undefined;
}

// Gives the items of a type in a collection another type name; returns how many it renamed.
export function renameItemType(
  db: DatabaseSync,
  collection: string,
  from: string,
  to: string,
): number {
  const sql = 'UPDATE items SET type = ? WHERE collection = ? AND type = ?';
  return Number(db.prepare(sql).run(to, collection, from).changes);
}

export function updateItemState(db: DatabaseSync, id: string, state: string, at: string): void {
  db.prepare('UPDATE items SET state = ?, updated_at = ? WHERE id = ?').run(state, at, id);
}

// Takes the lease only if it is free, expired or already the holder's: one conditional write, so
// two writers racing for the same item cannot both win.
export function takeLease(db: DatabaseSync, id: string, lease: Lease, at: string): boolean {
  const sql = `UPDATE items SET lease_holder = :holder, lease_expires_at = :expiresAt
    WHERE id = :id AND (lease_holder IS NULL OR lease_expires_at <= :at OR lease_holder = :holder)`;
  return db.prepare(sql).run({ id, at, ...lease }).changes === 1;
}

export function clearLease(db: DatabaseSync, id: string): void {
  db.prepare('UPDATE items SET lease_holder = NULL, lease_expires_at = NULL WHERE id = ?').run(id);
}

export type ItemContent = {
  title: string;
  fields: Record<string, unknown>;
  presetVersion: number;
  updatedAt: string;
};

export function updateItemContent(db: DatabaseSync, id: string, content: ItemContent): void {
  db.prepare(
    'UPDATE items SET title = ?, fields = ?, preset_version = ?, updated_at = ? WHERE id = ?',
  ).run(
    content.title,
    JSON.stringify(content.fields),
    content.presetVersion,
    content.updatedAt,
    id,
  );
}

// A profile as events and agents give it: as declared, with the family its model groups under.
export type ProfileView = Profile & { family: string };

export const profileView = (profile: Profile): ProfileView => ({
  harness: profile.harness,
  model: profile.model,
  effort: profile.effort,
  family: modelFamily(profile.model),
});

// `profile`: the profile the agent behind the event had declared when it was written (the agent
// acting, or the one relaying a decision); absent for the person and for agents with none.
export type EventRecord = {
  id: number;
  itemId: string;
  type: string;
  actor: Actor;
  at: string;
  data: Record<string, unknown>;
  profile?: ProfileView;
};

type EventRow = {
  id: number;
  item_id: string;
  type: string;
  actor_kind: Actor['kind'];
  actor_name: string;
  at: string;
  data: string;
  profile: string | null;
};

function toEvent(row: EventRow): EventRecord {
  const event: EventRecord = {
    id: row.id,
    itemId: row.item_id,
    type: row.type,
    actor: { kind: row.actor_kind, name: row.actor_name },
    at: row.at,
    data: JSON.parse(row.data) as Record<string, unknown>,
  };
  if (row.profile) event.profile = profileView(JSON.parse(row.profile) as Profile);
  return event;
}

// The agent whose profile an event keeps: the agent acting, or the one relaying the person's word.
function agentBehind(event: Omit<EventRecord, 'id'>): string | null {
  if (event.actor.kind === 'agent') return event.actor.name;
  return typeof event.data.via === 'string' ? event.data.via : null;
}

// Every event keeps the profile its agent has declared at that moment, read in the same statement.
export function appendEvent(db: DatabaseSync, event: Omit<EventRecord, 'id'>): void {
  db.prepare(
    `INSERT INTO events (item_id, type, actor_kind, actor_name, at, data, profile)
      VALUES (?, ?, ?, ?, ?, ?, (SELECT profile FROM agents WHERE name = ?))`,
  ).run(
    event.itemId,
    event.type,
    event.actor.kind,
    event.actor.name,
    event.at,
    JSON.stringify(event.data),
    agentBehind(event),
  );
}

export function selectEvents(db: DatabaseSync, itemId: string): EventRecord[] {
  const sql = 'SELECT * FROM events WHERE item_id = ? ORDER BY id';
  return (db.prepare(sql).all(itemId) as EventRow[]).map(toEvent);
}

// limit caps the oldest events after the cursor; latest keeps the newest ones instead (where a feed
// that starts now begins reading). Either way they come in commit order.
export type EventFilter = {
  item?: string;
  collection?: string;
  since?: number;
  limit?: number;
  latest?: number;
};

// Ids follow commit order (writers are serialized by BEGIN IMMEDIATE), so the last id read is a
// cursor: nothing committed later can land below it.
export function selectEventsAfter(db: DatabaseSync, filter: EventFilter): EventRecord[] {
  const matching = `SELECT events.* FROM events JOIN items ON items.id = events.item_id
    WHERE events.id > :since AND (:item IS NULL OR events.item_id = :item)
      AND (:collection IS NULL OR items.collection = :collection)`;
  const sql =
    filter.latest === undefined
      ? `${matching} ORDER BY events.id LIMIT :limit`
      : `SELECT * FROM (${matching} ORDER BY events.id DESC LIMIT :limit) ORDER BY id`;
  const params = {
    since: filter.since ?? 0,
    item: filter.item ?? null,
    collection: filter.collection ?? null,
    limit: filter.latest ?? filter.limit ?? -1,
  };
  return (db.prepare(sql).all(params) as EventRow[]).map(toEvent);
}

// When each item entered its current state: the time of its last created or transitioned event.
export function selectStateEntries(db: DatabaseSync): Map<string, string> {
  const sql = `SELECT item_id, at FROM events WHERE id IN (
    SELECT max(id) FROM events WHERE type IN ('created', 'transitioned') GROUP BY item_id)`;
  const rows = db.prepare(sql).all() as Array<{ item_id: string; at: string }>;
  return new Map(rows.map((row) => [row.item_id, row.at]));
}

export type EvidenceRecord = {
  id: number;
  itemId: string;
  role: EvidenceRole;
  // The id of the layout module it was attached to; null before modules, or for a type without any.
  module: string | null;
  kind: EvidenceKind;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  caption: string | null;
  createdAt: string;
  actor: Actor;
  channel: Channel;
};

type EvidenceRow = {
  id: number;
  item_id: string;
  role: EvidenceRole;
  module: string | null;
  kind: EvidenceKind;
  filename: string;
  content_type: string;
  size: number;
  sha256: string;
  caption: string | null;
  created_at: string;
  actor_kind: Actor['kind'];
  actor_name: string;
  channel: Channel;
};

function toEvidence(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    itemId: row.item_id,
    role: row.role,
    module: row.module,
    kind: row.kind,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    sha256: row.sha256,
    caption: row.caption,
    createdAt: row.created_at,
    actor: { kind: row.actor_kind, name: row.actor_name },
    channel: row.channel,
  };
}

export function insertEvidence(db: DatabaseSync, evidence: Omit<EvidenceRecord, 'id'>): number {
  const sql = `INSERT INTO evidence (item_id, role, module, kind, filename, content_type, size,
      sha256, caption, created_at, actor_kind, actor_name, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`;
  const row = db
    .prepare(sql)
    .get(
      evidence.itemId,
      evidence.role,
      evidence.module,
      evidence.kind,
      evidence.filename,
      evidence.contentType,
      evidence.size,
      evidence.sha256,
      evidence.caption,
      evidence.createdAt,
      evidence.actor.kind,
      evidence.actor.name,
      evidence.channel,
    );
  return Number(row?.id);
}

export function findEvidence(db: DatabaseSync, id: number): EvidenceRecord | undefined {
  const row = db.prepare('SELECT * FROM evidence WHERE id = ?').get(id);
  return row && toEvidence(row as EvidenceRow);
}

export function selectEvidence(db: DatabaseSync, itemId: string): EvidenceRecord[] {
  const sql = 'SELECT * FROM evidence WHERE item_id = ? ORDER BY id';
  return (db.prepare(sql).all(itemId) as EvidenceRow[]).map(toEvidence);
}

// A stored relation and who made it.
export type RelationRecord = Relation & { createdAt: string; actor: Actor; channel: Channel };

type RelationRow = {
  kind: RelationKind;
  from_id: string;
  to_id: string;
  created_at: string;
  actor_kind: Actor['kind'];
  actor_name: string;
  channel: Channel;
};

function toRelation(row: RelationRow): RelationRecord {
  return {
    kind: row.kind,
    from: row.from_id,
    to: row.to_id,
    createdAt: row.created_at,
    actor: { kind: row.actor_kind, name: row.actor_name },
    channel: row.channel,
  };
}

export function insertRelation(db: DatabaseSync, relation: RelationRecord): void {
  db.prepare(
    `INSERT INTO relations (kind, from_id, to_id, created_at, actor_kind, actor_name, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    relation.kind,
    relation.from,
    relation.to,
    relation.createdAt,
    relation.actor.kind,
    relation.actor.name,
    relation.channel,
  );
}

export function deleteRelation(db: DatabaseSync, { kind, from, to }: Relation): void {
  db.prepare('DELETE FROM relations WHERE kind = ? AND from_id = ? AND to_id = ?').run(
    kind,
    from,
    to,
  );
}

// Every relation, oldest first; `kind` narrows them to one kind.
export function selectRelations(db: DatabaseSync, kind?: RelationKind): RelationRecord[] {
  const sql = `SELECT * FROM relations WHERE (:kind IS NULL OR kind = :kind)
    ORDER BY created_at, rowid`;
  return (db.prepare(sql).all({ kind: kind ?? null }) as RelationRow[]).map(toRelation);
}

// The relations an item takes part in, from either side, oldest first.
export function selectRelationsOf(db: DatabaseSync, id: string): RelationRecord[] {
  const sql = `SELECT * FROM relations WHERE from_id = :id OR to_id = :id
    ORDER BY created_at, rowid`;
  return (db.prepare(sql).all({ id }) as RelationRow[]).map(toRelation);
}

export type ProjectIdentity = { id: string; name: string };

export function selectProjectIdentity(db: DatabaseSync): ProjectIdentity | undefined {
  return db.prepare('SELECT id, name FROM project').get() as ProjectIdentity | undefined;
}

// Writes the identity unless the project already has one, in one statement so that two processes
// opening the same database at once still leave a single row.
export function insertProjectIdentity(db: DatabaseSync, identity: ProjectIdentity): void {
  const sql = 'INSERT INTO project (id, name) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM project)';
  db.prepare(sql).run(identity.id, identity.name);
}

export function selectProjectIcon(db: DatabaseSync): string | null {
  const row = db.prepare('SELECT icon FROM project').get() as { icon: string | null } | undefined;
  return row?.icon ?? null;
}

export function updateProjectIcon(db: DatabaseSync, icon: string | null): void {
  db.prepare('UPDATE project SET icon = ?').run(icon);
}

// A repo of the project: the name its items give it, and what identifies it (core/repo.ts).
export type RepoRecord = { name: string; identity: string };

export function selectRepos(db: DatabaseSync): RepoRecord[] {
  return db.prepare('SELECT name, identity FROM repos ORDER BY name').all() as RepoRecord[];
}

export function insertRepo(db: DatabaseSync, repo: RepoRecord): void {
  db.prepare('INSERT INTO repos (name, identity) VALUES (?, ?)').run(repo.name, repo.identity);
}

export function renameRepo(db: DatabaseSync, identity: string, name: string): void {
  db.prepare('UPDATE repos SET name = ? WHERE identity = ?').run(name, identity);
}

export function deleteRepo(db: DatabaseSync, name: string): void {
  db.prepare('DELETE FROM repos WHERE name = ?').run(name);
}

// Whether the repos at the project's folders were read in (app/repos.ts).
export function selectReposRead(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT repos_read FROM project').get() as
    | { repos_read: number }
    | undefined;
  return row?.repos_read === 1;
}

export function markReposRead(db: DatabaseSync): void {
  db.prepare('UPDATE project SET repos_read = 1').run();
}

// An agent's presence: the harness it last came through, when it was last seen and when it
// connected (null for an agent only ever given a profile).
export type AgentRecord = {
  name: string;
  harness: string | null;
  harnessVersion: string | null;
  lastSeen: string;
  connectedAt: string | null;
};

type AgentRow = {
  name: string;
  harness: string | null;
  harness_version: string | null;
  last_seen: string;
  connected_at: string | null;
};

function toAgent(row: AgentRow): AgentRecord {
  return {
    name: row.name,
    harness: row.harness,
    harnessVersion: row.harness_version,
    lastSeen: row.last_seen,
    connectedAt: row.connected_at,
  };
}

export function findAgent(db: DatabaseSync, name: string): AgentRecord | undefined {
  const row = db.prepare('SELECT * FROM agents WHERE name = ?').get(name);
  return row && toAgent(row as AgentRow);
}

export function selectAgents(db: DatabaseSync): AgentRecord[] {
  const rows = db.prepare('SELECT * FROM agents ORDER BY name').all() as AgentRow[];
  return rows.map(toAgent);
}

// A record given without `connectedAt` keeps the one known.
export function upsertAgent(
  db: DatabaseSync,
  agent: Omit<AgentRecord, 'connectedAt'> & { connectedAt?: string | null },
): void {
  const sql = `INSERT INTO agents (name, harness, harness_version, last_seen, connected_at)
    VALUES (:name, :harness, :harnessVersion, :lastSeen, :connectedAt)
    ON CONFLICT (name) DO UPDATE SET harness = excluded.harness,
      harness_version = excluded.harness_version, last_seen = excluded.last_seen,
      connected_at = COALESCE(excluded.connected_at, agents.connected_at)`;
  db.prepare(sql).run({ ...agent, connectedAt: agent.connectedAt ?? null });
}

// The profile an agent declared, and whether it declared it in its current session.
export type DeclaredProfile = { profile: Profile; confirmed: boolean };

export function findProfile(db: DatabaseSync, agent: string): DeclaredProfile | undefined {
  const sql = 'SELECT profile, profile_confirmed FROM agents WHERE name = ?';
  const row = db.prepare(sql).get(agent) as
    | { profile: string | null; profile_confirmed: number }
    | undefined;
  if (!row?.profile) return undefined;
  return { profile: JSON.parse(row.profile) as Profile, confirmed: row.profile_confirmed === 1 };
}

// Sets the agent's profile, confirmed or not for its session. Returns whether it changed; each
// change is kept in agent_profiles.
export function saveProfile(
  db: DatabaseSync,
  agent: string,
  profile: Profile,
  { at, channel, confirmed }: { at: string; channel: string; confirmed: boolean },
): boolean {
  const { harness, model, effort } = profile;
  const json = JSON.stringify({ harness, model, effort });
  const before = db.prepare('SELECT profile FROM agents WHERE name = ?').get(agent) as
    | { profile: string | null }
    | undefined;
  const sql = `INSERT INTO agents (name, last_seen, profile, profile_confirmed)
    VALUES (:agent, :at, :json, :confirmed)
    ON CONFLICT (name) DO UPDATE SET profile = excluded.profile,
      profile_confirmed = excluded.profile_confirmed`;
  db.prepare(sql).run({ agent, at, json, confirmed: confirmed ? 1 : 0 });
  if (before?.profile === json) return false;
  const insert = 'INSERT INTO agent_profiles (agent, profile, at, channel) VALUES (?, ?, ?, ?)';
  db.prepare(insert).run(agent, json, at, channel);
  return true;
}

// A new session of the agent: its profile stands unconfirmed until it declares it again.
export function unconfirmProfile(db: DatabaseSync, agent: string): void {
  const sql = 'UPDATE agents SET profile_confirmed = 0 WHERE name = ? AND profile_confirmed = 1';
  db.prepare(sql).run(agent);
}

export type ProfileChange = { profile: ProfileView; at: string; channel: string };

// Every profile the agent declared, oldest first.
export function selectProfileChanges(db: DatabaseSync, agent: string): ProfileChange[] {
  const sql = 'SELECT profile, at, channel FROM agent_profiles WHERE agent = ? ORDER BY id';
  const rows = db.prepare(sql).all(agent) as { profile: string; at: string; channel: string }[];
  return rows.map(({ profile, at, channel }) => ({
    profile: profileView(JSON.parse(profile) as Profile),
    at,
    channel,
  }));
}

// What `otea next` last offered an agent: the item, the state it was in, and when.
export type Offer = { agent: string; item: string; state: string; at: string };

export function selectOffers(db: DatabaseSync): Offer[] {
  return db.prepare('SELECT agent, item, state, at FROM offers').all() as Offer[];
}

// An agent holds one offer at a time: a new one replaces the last.
export function saveOffer(db: DatabaseSync, offer: Offer): void {
  const sql = `INSERT INTO offers (agent, item, state, at) VALUES (:agent, :item, :state, :at)
    ON CONFLICT (agent) DO UPDATE SET item = excluded.item, state = excluded.state, at = excluded.at`;
  db.prepare(sql).run(offer);
}

// The items with a lease stored, live or expired, in creation order.
export function selectLeases(db: DatabaseSync): { id: string; lease: Lease }[] {
  const sql = `SELECT id, lease_holder, lease_expires_at FROM items
    WHERE lease_holder IS NOT NULL AND lease_expires_at IS NOT NULL ORDER BY created_at, rowid`;
  const rows = db.prepare(sql).all() as {
    id: string;
    lease_holder: string;
    lease_expires_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    lease: { holder: row.lease_holder, expiresAt: row.lease_expires_at },
  }));
}

// The item a create with this client key made, if one did (see the client_keys migration).
export function itemOfClientKey(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare('SELECT item FROM client_keys WHERE key = ?').get(key);
  return row === undefined ? undefined : String(row.item);
}

export function insertClientKey(db: DatabaseSync, key: string, item: string, at: string): void {
  db.prepare('INSERT INTO client_keys (key, item, at) VALUES (?, ?, ?)').run(key, item, at);
}
