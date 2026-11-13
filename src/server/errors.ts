import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { type ErrorCode, OteaError } from '../core/errors.ts';
import type { RefusalDetails } from '../core/refusal.ts';

export const HTTP_STATUS: Readonly<Record<ErrorCode, ContentfulStatusCode>> = {
  not_found: 404,
  invalid_transition: 409,
  not_undoable: 409,
  not_stuck: 409,
  already_exists: 409,
  invalid_name: 400,
  invalid_agent_name: 400,
  invalid_icon: 400,
  invalid_id: 400,
  forbidden: 403,
  reason_required: 400,
  invalid_preset: 500,
  invalid_fields: 422,
  invalid_type: 422,
  item_closed: 409,
  missing_fields: 422,
  not_claimable: 409,
  lease_held: 409,
  not_lease_holder: 409,
  not_relayable: 409,
  quote_required: 400,
  file_not_found: 404,
  evidence_too_large: 413,
  evidence_not_accepted: 422,
  module_required: 400,
  invalid_role: 400,
  invalid_relation: 400,
  invalid_gate: 400,
  self_relation: 400,
  parent_exists: 409,
  parent_type: 409,
  parent_required: 422,
  relation_cycle: 409,
  parent_across_boards: 409,
  children_open: 409,
  blockers_open: 409,
  different_repo: 409,
  in_use: 409,
  invalid_draft: 422,
  invalid_board: 422,
  board_conflict: 409,
  not_publishable: 422,
};

export class InvalidQuery extends Error {}

export class ForbiddenHost extends Error {}

export class RejectedRequest extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details: RefusalDetails | undefined;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    details?: RefusalDetails,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type ErrorBody = {
  error: { code: string; message: string; details?: RefusalDetails };
};

export type ErrorResponse = { status: ContentfulStatusCode; body: ErrorBody };

export function errorBody(code: string, message: string, details?: RefusalDetails): ErrorBody {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof OteaError) {
    return {
      status: HTTP_STATUS[error.code],
      body: errorBody(error.code, error.message, error.details),
    };
  }
  if (error instanceof InvalidQuery) {
    return { status: 400, body: errorBody('invalid_query', error.message) };
  }
  if (error instanceof RejectedRequest) {
    return { status: error.status, body: errorBody(error.code, error.message, error.details) };
  }
  if (error instanceof ForbiddenHost) {
    return { status: 403, body: errorBody('forbidden_host', error.message) };
  }
  return { status: 500, body: errorBody('unexpected', 'Unexpected error') };
}
