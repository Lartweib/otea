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
  ] as const)('maps %s to %i', (code, status) => {
    expect(HTTP_STATUS[code]).toBe(status);
  });

  it('describes an OteaError with its code and message', () => {
    expect(toErrorResponse(new OteaError('not_found', 'Gone'))).toEqual({
      status: 404,
      body: { error: { code: 'not_found', message: 'Gone' } },
    });
  });

  it('describes an invalid query as 400', () => {
    expect(toErrorResponse(new InvalidQuery('Bad turn'))).toEqual({
      status: 400,
      body: { error: { code: 'invalid_query', message: 'Bad turn' } },
    });
  });

  it('describes a forbidden host as 403', () => {
    expect(toErrorResponse(new ForbiddenHost('Nope'))).toEqual({
      status: 403,
      body: { error: { code: 'forbidden_host', message: 'Nope' } },
    });
  });

  it('hides the details of unexpected errors', () => {
    expect(toErrorResponse(new Error('secret path'))).toEqual({
      status: 500,
      body: { error: { code: 'unexpected', message: 'Unexpected error' } },
    });
  });
});
