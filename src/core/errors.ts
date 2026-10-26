export type ErrorCode =
  | 'invalid_transition'
  | 'not_found'
  | 'already_exists'
  | 'invalid_name'
  | 'invalid_id'
  | 'forbidden'
  | 'reason_required'
  | 'invalid_preset'
  | 'invalid_fields'
  | 'item_closed';

export class OteaError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'OteaError';
    this.code = code;
  }
}
