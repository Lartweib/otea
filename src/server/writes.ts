import type { Context } from 'hono';
import { z } from 'zod';
import type { Performer } from '../core/authority.ts';
import { RejectedRequest } from './errors.ts';
import type { Session } from './session.ts';

export const HUMAN_IN_UI: Performer = { actor: { kind: 'human', name: 'human' }, channel: 'ui' };

const MoveBody = z.object({ to: z.string().min(1), reason: z.string().optional() });

export type MoveRequest = { to: string; reason?: string };

function isJson(contentType: string | undefined): boolean {
  return contentType?.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

export function assertSignedIn(c: Context, auth: Session, purpose = 'act from the UI'): void {
  if (!auth.canWrite(c)) {
    throw new RejectedRequest(401, 'unauthorized', `Sign in with "otea open" to ${purpose}`);
  }
}

export function assertWritable(c: Context, auth: Session): void {
  assertSignedIn(c, auth);
  const origin = c.req.header('origin');
  if (origin !== `http://${c.req.header('host')}`) {
    throw new RejectedRequest(403, 'forbidden_origin', `Origin "${origin ?? ''}" is not allowed`);
  }
  if (!isJson(c.req.header('content-type'))) {
    throw new RejectedRequest(415, 'unsupported_media_type', 'Send the body as application/json');
  }
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
  fields: z.record(z.string(), z.string()),
});

// `type` may be left out when the collection's preset has a single type.
export type CreateRequest = {
  collection: string;
  type?: string;
  title: string;
  fields: Record<string, string>;
};

export async function createRequest(c: Context): Promise<CreateRequest> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    throw new RejectedRequest(
      400,
      'invalid_body',
      'Expected {"collection": string, "type"?: string, "fields": {[key]: string}}',
    );
  }
  const { collection, type, fields } = parsed.data;
  const { title = '', ...rest } = fields;
  return type === undefined
    ? { collection, title, fields: rest }
    : { collection, type, title, fields: rest };
}
