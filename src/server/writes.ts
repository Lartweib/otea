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
import type { Session } from './session.ts';

export const HUMAN_IN_UI: Performer = { actor: { kind: 'human', name: 'human' }, channel: 'ui' };

const MoveBody = z.object({ to: z.string().min(1), reason: z.string().optional() });

export type MoveRequest = { to: string; reason?: string };

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

// Writes come signed in, from the UI's own origin, as JSON. Creating an item may also come as a
// form, to carry the files it is filed with (withFiles); the origin check covers both.
export function assertWritable(c: Context, auth: Session, withFiles = false): void {
  assertSignedIn(c, auth);
  const origin = c.req.header('origin');
  if (origin !== `http://${c.req.header('host')}`) {
    throw new RejectedRequest(403, 'forbidden_origin', `Origin "${origin ?? ''}" is not allowed`);
  }
  const media = mediaOf(c.req.header('content-type'));
  if (media === JSON_TYPE || (withFiles && media === FORM_TYPE)) return;
  const expected = withFiles ? `${JSON_TYPE} or ${FORM_TYPE}` : JSON_TYPE;
  throw new RejectedRequest(415, 'unsupported_media_type', `Send the body as ${expected}`);
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
