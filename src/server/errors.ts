import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { type ErrorCode, OteaError } from '../core/errors.ts';

export const HTTP_STATUS: Readonly<Record<ErrorCode, ContentfulStatusCode>> = {
  not_found: 404,
  invalid_transition: 409,
  already_exists: 409,
  invalid_name: 400,
  invalid_id: 400,
  forbidden: 403,
  reason_required: 400,
  invalid_preset: 500,
  invalid_fields: 422,
  item_closed: 409,
  missing_fields: 422,
  not_claimable: 409,
  lease_held: 409,
  not_lease_holder: 409,
};

export class InvalidQuery extends Error {}

export class ForbiddenHost extends Error {}

export class RejectedRequest extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type ErrorBody = { error: { code: string; message: string } };

export type ErrorResponse = { status: ContentfulStatusCode; body: ErrorBody };

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof OteaError) {
    return { status: HTTP_STATUS[error.code], body: errorBody(error.code, error.message) };
  }
  if (error instanceof InvalidQuery) {
    return { status: 400, body: errorBody('invalid_query', error.message) };
  }
  if (error instanceof RejectedRequest) {
    return { status: error.status, body: errorBody(error.code, error.message) };
  }
  if (error instanceof ForbiddenHost) {
    return { status: 403, body: errorBody('forbidden_host', error.message) };
  }
  return { status: 500, body: errorBody('unexpected', 'Unexpected error') };
}
