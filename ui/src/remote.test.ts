import { describe, expect, it } from 'vitest';
import { afterFailure, type Remote, SIGN_IN, serverMessage, UNREACHABLE } from './remote.ts';

const loaded: Remote<string[]> = { status: 'ready', value: ['A'] };
const offline = new TypeError('Failed to fetch');
const serverError = new Error('GET /api/items failed with 500');

describe('afterFailure', () => {
  it('keeps the last data when the server cannot be reached', () => {
    expect(afterFailure(loaded, offline, 'live')).toBe(loaded);
  });

  it('keeps the last data while the connection is not live', () => {
    expect(afterFailure(loaded, serverError, 'reconnecting')).toBe(loaded);
  });

  it('reports a server error while live even if data was loaded', () => {
    expect(afterFailure(loaded, serverError, 'live')).toEqual({
      status: 'failed',
      message: 'GET /api/items failed with 500',
    });
  });

  it('explains how to start the server when nothing was loaded and it cannot be reached', () => {
    expect(afterFailure({ status: 'loading' }, offline, 'connecting')).toEqual({
      status: 'failed',
      message: UNREACHABLE,
    });
    expect(UNREACHABLE).toBe("Can't reach Otea. Is `otea serve` running?");
  });

  it('reports a server error when nothing was loaded', () => {
    expect(afterFailure({ status: 'loading' }, serverError, 'live')).toEqual({
      status: 'failed',
      message: 'GET /api/items failed with 500',
    });
  });
});

describe('serverMessage', () => {
  it('uses the message of an error body', () => {
    expect(serverMessage({ error: { code: 'forbidden', message: 'Not you' } }, 403)).toBe(
      'Not you',
    );
  });

  it.each([undefined, {}, { error: 'x' }, { error: { message: 3 } }])(
    'falls back to the status for %j',
    (body) => {
      expect(serverMessage(body, 500)).toBe('Request failed with 500');
    },
  );

  it('explains how to sign in when the session is missing', () => {
    expect(serverMessage({ error: { code: 'unauthorized', message: 'x' } }, 401)).toBe(SIGN_IN);
  });
});
