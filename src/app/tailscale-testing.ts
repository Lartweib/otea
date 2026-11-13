import type { ServeRoute, TailscaleCli, TailscaleStatus } from './tailscale.ts';

// A fake tailscale CLI for tests: it answers from what the test sets and records what Otea asked
// it to do. No test runs the real one; `tailscale up` and `tailscale serve` change the network.
export type FakeTailscale = TailscaleCli & {
  installed: boolean;
  state: TailscaleStatus;
  routes: ServeRoute[];
  calls: string[];
  // What `tailscale up` leaves behind: logged in, unless the test says otherwise.
  afterUp: Partial<TailscaleStatus>;
  serveError: Error | undefined;
};

export const TAILNET_HOST = 'desk.tail1.ts.net';

export function fakeTailscale(state: Partial<TailscaleStatus> = {}): FakeTailscale {
  const fake: FakeTailscale = {
    installed: true,
    state: {
      backend: 'Running',
      dnsName: TAILNET_HOST,
      magicDns: true,
      https: true,
      authUrl: null,
      ...state,
    },
    routes: [],
    calls: [],
    afterUp: { backend: 'Running', authUrl: null },
    serveError: undefined,
    locate: () => (fake.installed ? '/usr/bin/tailscale' : undefined),
    status: async () => {
      fake.calls.push('status');
      return fake.state;
    },
    serveStatus: async () => {
      fake.calls.push('serve status');
      return fake.routes;
    },
    up: async () => {
      fake.calls.push('up');
      fake.state = { ...fake.state, ...fake.afterUp };
    },
    serve: async (port) => {
      fake.calls.push(`serve ${port}`);
      if (fake.serveError) throw fake.serveError;
      const host = fake.state.dnsName ?? '';
      fake.routes = [{ host, port: 443, path: '/', target: `http://127.0.0.1:${port}` }];
    },
  };
  return fake;
}
