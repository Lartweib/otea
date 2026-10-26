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

export function assertWritable(c: Context, auth: Session): void {
  if (!auth.canWrite(c)) {
    throw new RejectedRequest(401, 'unauthorized', 'Sign in with "otea open" to act from the UI');
  }
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
