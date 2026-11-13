import { basename } from 'node:path';
import type { Context } from 'hono';
import { z } from 'zod';
import type { EvidenceFile } from '../app/evidence.ts';
import type { Performer } from '../core/authority.ts';
import {
  EVIDENCE_ROLES,
  type EvidenceRole,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_MB,
} from '../core/evidence.ts';
import { RejectedRequest } from './errors.ts';
import { clientOf, type Session } from './session.ts';

export const HUMAN_IN_UI: Performer = { actor: { kind: 'human', name: 'human' }, channel: 'ui' };

const MoveBody = z.object({ to: z.string().min(1), reason: z.string().optional() });

export type MoveRequest = { to: string; reason?: string };

const UndoBody = z.union([
  z.object({ from: z.string().min(1) }),
  z.object({ release: z.literal(true) }),
]);

const ReassignBody = z.object({ agent: z.string().min(1) });

const JSON_TYPE = 'application/json';
const FORM_TYPE = 'multipart/form-data';

function mediaOf(contentType: string | undefined): string | undefined {
  return contentType?.split(';')[0]?.trim().toLowerCase();
}

export function assertSignedIn(c: Context, auth: Session, purpose = 'act from the UI'): void {
  if (!auth.canWrite(c)) {
    throw new RejectedRequest(401, 'unauthorized', `Sign in with "otea open" to ${purpose}`);
  }
}

// A write comes from a page this server served, as JSON: no other site can forge one. Creating an
// item may also come as a form, to carry the files it is filed with (withFiles); the origin check
// covers both. A phone on Tailscale opens the UI over HTTPS, so its pages' origin is https://.
export function assertSameOrigin(c: Context, withFiles = false): void {
  const origin = c.req.header('origin');
  const client = clientOf(c);
  const scheme = client.kind !== 'local' && client.secure ? 'https' : 'http';
  if (origin !== `${scheme}://${c.req.header('host')}`) {
    throw new RejectedRequest(403, 'forbidden_origin', `Origin "${origin ?? ''}" is not allowed`);
  }
  const media = mediaOf(c.req.header('content-type'));
  if (media === JSON_TYPE || (withFiles && media === FORM_TYPE)) return;
  const expected = withFiles ? `${JSON_TYPE} or ${FORM_TYPE}` : JSON_TYPE;
  throw new RejectedRequest(415, 'unsupported_media_type', `Send the body as ${expected}`);
}

// Writes come signed in, from the UI's own origin (assertSameOrigin).
export function assertWritable(c: Context, auth: Session, withFiles = false): void {
  assertSignedIn(c, auth);
  assertSameOrigin(c, withFiles);
}

// Changes to the project's setup (paths, presets, boards) come from this computer's signed-in
// browser, from the UI's own origin: a paired device may act on items but not reconfigure the project.
export function assertConfigurable(c: Context, auth: Session): void {
  assertSignedIn(c, auth);
  if (!auth.canConfigure(c)) {
    throw new RejectedRequest(
      403,
      'forbidden',
      'Only the browser on this computer, signed in with "otea open", changes the project setup',
      { kind: 'desk_only' },
    );
  }
  assertSameOrigin(c);
}

export async function moveRequest(c: Context): Promise<MoveRequest> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = MoveBody.safeParse(raw);
  if (!parsed.success) {
    throw new RejectedRequest(400, 'invalid_body', 'Expected {"to": string, "reason"?: string}');
  }
  const { to, reason } = parsed.data;
  return reason === undefined ? { to } : { to, reason };
}

const UpdateBody = z.object({ fields: z.record(z.string(), z.string()) });

// The fields the person fills on the item page (its own step's "Rellenar").
export async function updateRequest(c: Context): Promise<{ fields: Record<string, string> }> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = UpdateBody.safeParse(raw);
  if (!parsed.success) {
    throw new RejectedRequest(400, 'invalid_body', 'Expected {"fields": {[key]: string}}');
  }
  return { fields: parsed.data.fields };
}

const CreateBody = z.object({
  collection: z.string().min(1),
  type: z.string().min(1).optional(),
  parent: z.string().min(1).optional(),
  fields: z.record(z.string(), z.string()),
  // One entry per file part, in order: where each file goes.
  evidence: z
    .array(
      z.object({
        role: z.enum(EVIDENCE_ROLES).optional(),
        module: z.string().min(1).optional(),
      }),
    )
    .optional(),
});

const CREATE_SHAPE =
  '{"collection": string, "type"?: string, "parent"?: string, "fields": {[key]: string}}';

// At most this many files come with a new item, each within the evidence limit.
export const MAX_INTAKE_FILES = 10;

// The largest body a create may send: its files and some room for the rest of the form.
export const MAX_CREATE_BYTES = MAX_INTAKE_FILES * MAX_EVIDENCE_BYTES + 1024 * 1024;

// `type` may be left out when the collection's preset has a single type; `parent` creates a child;
// `files`, sent as a form, are attached to it as evidence in the same write.
export type CreateRequest = {
  collection: string;
  type?: string;
  parent?: string;
  title: string;
  fields: Record<string, string>;
  files: EvidenceFile[];
};

function invalidCreate(detail = ''): RejectedRequest {
  return new RejectedRequest(400, 'invalid_body', `Expected ${CREATE_SHAPE}${detail}`);
}

type Place = { role?: EvidenceRole | undefined; module?: string | undefined };

async function fileOf(file: File, place: Place = {}): Promise<EvidenceFile> {
  const filename = basename(file.name.replaceAll('\\', '/'));
  if (filename === '' || filename === '.' || filename === '..') {
    throw new RejectedRequest(400, 'invalid_body', 'Each file needs a name');
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new RejectedRequest(
      413,
      'evidence_too_large',
      `${filename} is over the ${MAX_EVIDENCE_MB} MB evidence limit`,
    );
  }
  return {
    filename,
    bytes: Buffer.from(await file.arrayBuffer()),
    ...(place.role === undefined ? {} : { role: place.role }),
    ...(place.module === undefined ? {} : { module: place.module }),
  };
}

// The item as JSON, or as a form: its JSON in the `item` part and each file in a `file` part, in
// the order of `evidence`.
async function readCreate(c: Context): Promise<{ raw: unknown; files: File[] }> {
  if (mediaOf(c.req.header('content-type')) !== FORM_TYPE) {
    return { raw: await c.req.json().catch(() => undefined), files: [] };
  }
  const form = await c.req.parseBody({ all: true }).catch(() => {
    throw invalidCreate(' as the "item" part of the form');
  });
  const { item, file = [] } = form;
  const files = (Array.isArray(file) ? file : [file]).filter((part) => part instanceof File);
  if (typeof item !== 'string') throw invalidCreate(' as the "item" part of the form');
  let raw: unknown;
  try {
    raw = JSON.parse(item);
  } catch {
    throw invalidCreate(' as the "item" part of the form');
  }
  return { raw, files };
}

export async function createRequest(c: Context): Promise<CreateRequest> {
  const { raw, files } = await readCreate(c);
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) throw invalidCreate();
  const { collection, type, parent, fields, evidence = [] } = parsed.data;
  if (files.length > MAX_INTAKE_FILES) {
    throw new RejectedRequest(400, 'invalid_body', `Send at most ${MAX_INTAKE_FILES} files`);
  }
  if (evidence.length > files.length) {
    throw new RejectedRequest(400, 'invalid_body', 'Each evidence entry needs its file part');
  }
  const { title = '', ...rest } = fields;
  return {
    collection,
    ...(type === undefined ? {} : { type }),
    ...(parent === undefined ? {} : { parent }),
    title,
    fields: rest,
    files: await Promise.all(files.map((file, at) => fileOf(file, evidence[at]))),
  };
}

const CLIENT_KEY = /^[A-Za-z0-9_-]{1,128}$/;

// The create's Idempotency-Key, when the client sends one: a phone resending a capture it queued
// offline gets the item the first send made instead of a second one.
export function clientKeyOf(c: Context): string | undefined {
  const key = c.req.header('idempotency-key');
  if (key === undefined) return undefined;
  if (!CLIENT_KEY.test(key)) {
    throw new RejectedRequest(
      400,
      'invalid_idempotency_key',
      'Idempotency-Key takes 1 to 128 letters, digits, "-" or "_"',
    );
  }
  return key;
}

const LinkBody = z.object({ kind: z.string().min(1), other: z.string().min(1) });

// A relation from the item in the path: `kind` as `otea link` takes it, `other` the item it points to.
export type LinkRequest = { kind: string; other: string };

export async function linkRequest(c: Context): Promise<LinkRequest> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = LinkBody.safeParse(raw);
  if (!parsed.success) {
    throw new RejectedRequest(400, 'invalid_body', 'Expected {"kind": string, "other": string}');
  }
  return parsed.data;
}

const BriefBody = z.object({
  ids: z.array(z.string().min(1)).min(1),
  limits: z.array(z.string()).optional(),
  success: z.array(z.string()).optional(),
});

// The items a brief covers, in the order the person put them, and its limits and success lines.
export type BriefBodyRequest = { ids: string[]; limits?: string[]; success?: string[] };

export async function briefRequest(c: Context): Promise<BriefBodyRequest> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = BriefBody.safeParse(raw);
  if (!parsed.success) {
    throw new RejectedRequest(
      400,
      'invalid_body',
      'Expected {"ids": string[], "limits"?: string[], "success"?: string[]}',
    );
  }
  const { ids, limits, success } = parsed.data;
  return {
    ids,
    ...(limits === undefined ? {} : { limits }),
    ...(success === undefined ? {} : { success }),
  };
}

const PathBody = z.object({ path: z.string().min(1) });

export async function pathRequest(c: Context): Promise<{ path: string }> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = PathBody.safeParse(raw);
  if (!parsed.success) throw new RejectedRequest(400, 'invalid_body', 'Expected {"path": string}');
  return parsed.data;
}

const RelinkBody = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  force: z.boolean().optional(),
});

// Moves a linked path to where its repo went; `force` relinks a folder that holds another repo.
export type RelinkRequest = { from: string; to: string; force: boolean };

export async function relinkRequest(c: Context): Promise<RelinkRequest> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = RelinkBody.safeParse(raw);
  if (!parsed.success) {
    throw new RejectedRequest(
      400,
      'invalid_body',
      'Expected {"from": string, "to": string, "force"?: boolean}',
    );
  }
  const { from, to, force = false } = parsed.data;
  return { from, to, force };
}

// Takes back the person's last move (the state it left, as the client saw it), or their last
// restart or reassign of a stuck item ({"release": true}).
export async function undoRequest(c: Context): Promise<{ from: string } | { release: true }> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = UndoBody.safeParse(raw);
  if (!parsed.success) {
    throw new RejectedRequest(
      400,
      'invalid_body',
      'Expected {"from": string} or {"release": true}',
    );
  }
  return 'from' in parsed.data ? { from: parsed.data.from } : { release: true };
}

// Leaves a stuck item for the agent named.
export async function reassignRequest(c: Context): Promise<{ agent: string }> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = ReassignBody.safeParse(raw);
  if (!parsed.success) throw new RejectedRequest(400, 'invalid_body', 'Expected {"agent": string}');
  return parsed.data;
}

const NoteBody = z.object({
  text: z.string(),
  anchor: z
    .object({ evidence: z.number().int().positive(), seconds: z.number().min(0).optional() })
    .optional(),
});

export type NoteRequest = { text: string; anchor?: { evidence: number; seconds?: number } };

// A note from the person to the agent at work: its text, and the evidence it is on, if any.
export async function noteRequest(c: Context): Promise<NoteRequest> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = NoteBody.safeParse(raw);
  if (!parsed.success)
    throw new RejectedRequest(
      400,
      'invalid_body',
      'Expected {"text": string, "anchor"?: {"evidence": number, "seconds"?: number}}',
    );
  const { text, anchor } = parsed.data;
  if (anchor === undefined) return { text };
  const { evidence, seconds } = anchor;
  return { text, anchor: { evidence, ...(seconds === undefined ? {} : { seconds }) } };
}
