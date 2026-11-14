import type { RefusalDetails } from './refusal.ts';

export type ErrorCode =
  | 'invalid_transition'
  | 'not_undoable'
  | 'not_stuck'
  | 'not_found'
  | 'already_exists'
  | 'invalid_name'
  | 'invalid_agent_name'
  | 'unnamed_agent'
  | 'invalid_icon'
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
  | 'parent_type'
  | 'parent_required'
  | 'relation_cycle'
  | 'children_open'
  | 'blockers_open'
  | 'parent_across_boards'
  | 'different_repo'
  | 'in_use'
  | 'invalid_draft'
  | 'invalid_board'
  | 'board_conflict'
  | 'not_publishable'
  | 'invalid_gate'
  | 'invalid_profile'
  | 'profile_required'
  | 'transport_unavailable'
  // An item of an archived board: read-only until the person restores the board.
  | 'board_archived';

// `details`: what the refusal says, as data, for the web UI to word it in its own language; the
// message is the English agents and the CLI read.
export class OteaError extends Error {
  readonly code: ErrorCode;
  readonly details: RefusalDetails | undefined;

  constructor(code: ErrorCode, message: string, details?: RefusalDetails) {
    super(message);
    this.name = 'OteaError';
    this.code = code;
    this.details = details;
  }
}
