import type { ErrorCode } from '../core/errors.ts';

export type FailureCode = ErrorCode | 'usage' | 'unexpected' | 'validation_failed';

export const EXIT_CODES: Readonly<Record<'ok' | FailureCode, number>> = {
  ok: 0,
  unexpected: 1,
  usage: 2,
  not_found: 3,
  invalid_transition: 4,
  item_closed: 4,
  already_exists: 5,
  invalid_name: 6,
  invalid_id: 6,
  forbidden: 7,
  reason_required: 2,
  invalid_fields: 8,
  missing_fields: 8,
  invalid_preset: 9,
  validation_failed: 10,
};
