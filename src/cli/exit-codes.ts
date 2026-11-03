import type { ErrorCode } from '../core/errors.ts';

export type FailureCode =
  | ErrorCode
  | 'usage'
  | 'unexpected'
  | 'validation_failed'
  | 'not_running'
  | 'timeout'
  | 'interrupted'
  | 'gate_refused'
  | 'hook_refused';

export const EXIT_CODES: Readonly<Record<'ok' | FailureCode, number>> = {
  ok: 0,
  unexpected: 1,
  // otea check: the gate refuses the action, the exit code hooks stop on.
  gate_refused: 1,
  // otea check --claude-hook: the code that makes Claude Code block the tool call.
  hook_refused: 2,
  usage: 2,
  not_found: 3,
  invalid_transition: 4,
  item_closed: 4,
  not_claimable: 4,
  not_relayable: 4,
  already_exists: 5,
  invalid_name: 6,
  invalid_agent_name: 6,
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
  invalid_relation: 2,
  self_relation: 16,
  parent_exists: 16,
  parent_type: 16,
  parent_required: 16,
  relation_cycle: 16,
  parent_across_boards: 16,
  children_open: 4,
  blockers_open: 4,
  different_repo: 17,
  in_use: 18,
  invalid_blueprint: 9,
  link_not_in_blueprint: 16,
  // 128 + SIGINT, as shells report a command stopped by Ctrl+C.
  interrupted: 130,
};
