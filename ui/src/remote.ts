import type { Connection } from './hooks.ts';
import { t } from './i18n/i18n.ts';

export type Remote<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'failed'; message: string };

export const unreachable = () => t('error.unreachable');

export function afterFailure<T>(
  previous: Remote<T>,
  error: unknown,
  connection: Connection,
): Remote<T> {
  const lost = error instanceof TypeError;
  if (previous.status === 'ready' && (lost || connection !== 'live')) return previous;
  if (lost) return { status: 'failed', message: unreachable() };
  return { status: 'failed', message: error instanceof Error ? error.message : t('common.failed') };
}

export const signIn = () => t('error.signIn');

export function serverMessage(body: unknown, status: number): string {
  if (status === 401) return signIn();
  const message = (body as { error?: { message?: unknown } } | undefined)?.error?.message;
  return typeof message === 'string' ? message : t('error.requestFailed', { status });
}
