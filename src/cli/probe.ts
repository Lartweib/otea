export type Probe = 'ours' | 'other' | 'down';

export async function probeSignIn(signInUrl: string): Promise<Probe> {
  try {
    const response = await fetch(signInUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2000),
    });
    await response.body?.cancel();
    if (response.status === 302 && response.headers.get('location') === '/') return 'ours';
    return response.status === 401 ? 'other' : 'down';
  } catch {
    return 'down';
  }
}
