import { describe, expect, it } from 'vitest';
import { OteaError } from '../core/errors.ts';
import { ForbiddenHost, HTTP_STATUS, InvalidQuery, toErrorResponse } from './errors.ts';

describe('errors', () => {
  it.each([
    ['not_found', 404],
    ['invalid_transition', 409],
    ['already_exists', 409],
    ['invalid_name', 400],
    ['invalid_id', 400],
    ['forbidden', 403],
    ['reason_required', 400],
    ['invalid_preset', 500],
    ['invalid_fields', 422],
    ['item_closed', 409],
    ['missing_fields', 422],
  ] as const)('maps %s to %i', (code, status) => {
    expect(HTTP_STATUS[code]).toBe(status);
  });

  // An OteaError keeps its code and message, and a refusal its details beside the English message
  // for the UI to word it; an unexpected error hides its details.
  const details = { kind: 'closed', item: 'BUG-1' } as const;
  it.each<[string, Error, number, Record<string, unknown>]>([
    [
      'an OteaError',
      new OteaError('not_found', 'Gone'),
      404,
      { code: 'not_found', message: 'Gone' },
    ],
    [
      'a refusal with details',
      new OteaError('item_closed', 'BUG-1 is done', details),
      409,
      { code: 'item_closed', message: 'BUG-1 is done', details },
    ],
    [
      'an invalid query',
      new InvalidQuery('Bad turn'),
      400,
      { code: 'invalid_query', message: 'Bad turn' },
    ],
    [
      'a forbidden host',
      new ForbiddenHost('Nope'),
      403,
      { code: 'forbidden_host', message: 'Nope' },
    ],
    [
      'an unexpected error',
      new Error('secret path'),
      500,
      { code: 'unexpected', message: 'Unexpected error' },
    ],
  ])('describes %s as %i', (_, error, status, body) => {
    expect(toErrorResponse(error)).toEqual({ status, body: { error: body } });
  });
});
