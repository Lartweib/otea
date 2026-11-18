export type Probe = 'ours' | 'other' | 'down';

// Whether the server at a sign-in link is this Otea home's: it takes the token and sends the browser
// on to a page of its own (a project's, or `/`); another home's server refuses the token.
export async function probeSignIn(signInUrl: string): Promise<Probe> {
  try {
    const response = await fetch(signInUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2000),
    });
    await response.body?.cancel();
    const location = response.headers.get('location') ?? '';
    if (response.status === 302 && location.startsWith('/')) return 'ours';
    return response.status === 401 ? 'other' : 'down';
  } catch {
    return 'down';
  }
}
