import type { Connection } from './hooks.ts';

export type Remote<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'failed'; message: string };

export const UNREACHABLE = "Can't reach Otea. Is `otea serve` running?";

export function afterFailure<T>(
  previous: Remote<T>,
  error: unknown,
  connection: Connection,
): Remote<T> {
  const unreachable = error instanceof TypeError;
  if (previous.status === 'ready' && (unreachable || connection !== 'live')) return previous;
  if (unreachable) return { status: 'failed', message: UNREACHABLE };
  return { status: 'failed', message: error instanceof Error ? error.message : 'Failed' };
}

export const SIGN_IN = 'This browser is not signed in. Run `otea open` to act from it.';

export function serverMessage(body: unknown, status: number): string {
  if (status === 401) return SIGN_IN;
  const message = (body as { error?: { message?: unknown } } | undefined)?.error?.message;
  return typeof message === 'string' ? message : `Request failed with ${status}`;
}
