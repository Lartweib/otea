import type { ErrorCode } from '../core/errors.ts';

export type FailureCode =
  | ErrorCode
  | 'usage'
  | 'unexpected'
  | 'validation_failed'
  | 'not_running'
  | 'not_connected'
  | 'timeout'
  | 'interrupted'
  | 'gate_refused'
  | 'forge_unavailable';

export const EXIT_CODES: Readonly<Record<'ok' | FailureCode, number>> = {
  ok: 0,
  unexpected: 1,
  // otea check: the gate refuses the action; its own code, so a hook tells a refusal from a crash,
  // on which it stops too, saying Otea could not check.
  gate_refused: 19,
  usage: 2,
  not_found: 3,
  invalid_transition: 4,
  not_undoable: 4,
  not_stuck: 4,
  item_closed: 4,
  not_claimable: 4,
  not_relayable: 4,
  already_exists: 5,
  invalid_name: 6,
  invalid_agent_name: 6,
  unnamed_agent: 2,
  invalid_icon: 6,
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
  // otea connect --check: no agent reached Otea through its MCP server yet.
  not_connected: 11,
  lease_held: 12,
  not_lease_holder: 12,
  // Another open MCP session works under the agent name.
  name_in_use: 12,
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
  invalid_draft: 9,
  invalid_board: 9,
  not_publishable: 9,
  invalid_gate: 2,
  invalid_profile: 2,
  // No profile declared, or not declared again in this session: otea profile says how.
  profile_required: 2,
  board_conflict: 4,
  // A phone transport that cannot carry a phone yet: Tailscale not ready, the Otea relay.
  transport_unavailable: 20,
  // An item of an archived board: it is read-only until the person restores the board in Studio.
  board_archived: 21,
  // otea hook install --forge could not set the forge's rules (no gh, signed out, refused): it
  // printed the steps to take by hand.
  forge_unavailable: 22,
  // 128 + SIGINT, as shells report a command stopped by Ctrl+C.
  interrupted: 130,
};
