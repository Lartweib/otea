import { useEffect, useState } from 'react';
import { fetchAgents } from './api.ts';
import type { Connection } from './hooks.ts';
import { type Agent, PRESENCE_POLL_MS } from './presence.ts';

// The agents of this project, kept current: asked again on every presence event of the live stream
// (and every item change, since a lease is taken or given back with one), and every ten seconds
// besides, since time passing sends nothing and `live` and the ages are worked out on the server's
// clock. undefined until the first answer, null when the server has no presence endpoint (an older
// one). A failed ask keeps what was known: the pill never turns into an error.
export function useAgents(
  version: number,
  presence: number,
  connection: Connection,
): Agent[] | null | undefined {
  const [agents, setAgents] = useState<Agent[] | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const absent = agents === null;
  useEffect(() => {
    if (absent || connection !== 'live') return;
    const timer = setInterval(() => setTick((count) => count + 1), PRESENCE_POLL_MS);
    return () => clearInterval(timer);
  }, [absent, connection]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version, presence or tick means ask again
  useEffect(() => {
    if (absent) return;
    const controller = new AbortController();
    fetchAgents(controller.signal).then(setAgents, () => undefined);
    return () => controller.abort();
  }, [version, presence, tick, absent]);
  return agents;
}
