import { useEffect, useState } from 'react';
import { fetchAgents } from './api.ts';
import type { Connection } from './hooks.ts';
import { type Agent, PRESENCE_POLL_MS } from './presence.ts';

// The agents of this project, kept current: asked again on every change the live stream reports and
// every ten seconds besides, since a session or a lease can lapse without a write. undefined until
// the first answer, null when the server has no presence endpoint. A failed ask keeps what was
// known: the pill never turns into an error.
export function useAgents(version: number, connection: Connection): Agent[] | null | undefined {
  const [agents, setAgents] = useState<Agent[] | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const absent = agents === null;
  useEffect(() => {
    if (absent || connection !== 'live') return;
    const timer = setInterval(() => setTick((count) => count + 1), PRESENCE_POLL_MS);
    return () => clearInterval(timer);
  }, [absent, connection]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version or tick means ask again
  useEffect(() => {
    if (absent) return;
    const controller = new AbortController();
    fetchAgents(controller.signal).then(setAgents, () => undefined);
    return () => controller.abort();
  }, [version, tick, absent]);
  return agents;
}
