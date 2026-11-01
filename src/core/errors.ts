export type ErrorCode =
  | 'invalid_transition'
  | 'not_found'
  | 'already_exists'
  | 'invalid_name'
  | 'invalid_agent_name'
  | 'invalid_id'
  | 'forbidden'
  | 'reason_required'
  | 'invalid_preset'
  | 'invalid_fields'
  | 'invalid_type'
  | 'item_closed'
  | 'missing_fields'
  | 'not_claimable'
  | 'lease_held'
  | 'not_lease_holder'
  | 'not_relayable'
  | 'quote_required'
  | 'file_not_found'
  | 'evidence_too_large'
  | 'evidence_not_accepted'
  | 'module_required'
  | 'invalid_role'
  | 'invalid_relation'
  | 'self_relation'
  | 'parent_exists'
  | 'relation_cycle'
  | 'children_open';

export class OteaError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'OteaError';
    this.code = code;
  }
}
