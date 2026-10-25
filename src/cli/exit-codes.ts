import type { ErrorCode } from '../core/errors.ts';

export type FailureCode = ErrorCode | 'usage' | 'unexpected';

export const EXIT_CODES: Readonly<Record<'ok' | FailureCode, number>> = {
  ok: 0,
  unexpected: 1,
  usage: 2,
  not_found: 3,
  invalid_transition: 4,
  already_exists: 5,
  invalid_name: 6,
  invalid_id: 6,
};
