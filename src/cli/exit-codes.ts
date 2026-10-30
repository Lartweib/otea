import type { ErrorCode } from '../core/errors.ts';

export type FailureCode =
  | ErrorCode
  | 'usage'
  | 'unexpected'
  | 'validation_failed'
  | 'not_running'
  | 'timeout'
  | 'interrupted';

export const EXIT_CODES: Readonly<Record<'ok' | FailureCode, number>> = {
  ok: 0,
  unexpected: 1,
  usage: 2,
  not_found: 3,
  invalid_transition: 4,
  item_closed: 4,
  not_claimable: 4,
  not_relayable: 4,
  already_exists: 5,
  invalid_name: 6,
  invalid_id: 6,
  forbidden: 7,
  reason_required: 2,
  quote_required: 2,
  file_not_found: 3,
  invalid_fields: 8,
  invalid_type: 8,
  missing_fields: 8,
  invalid_preset: 9,
  validation_failed: 10,
  not_running: 11,
  lease_held: 12,
  not_lease_holder: 12,
  timeout: 13,
  evidence_too_large: 14,
  evidence_not_accepted: 15,
  module_required: 2,
  invalid_role: 2,
  // 128 + SIGINT, as shells report a command stopped by Ctrl+C.
  interrupted: 130,
};
