import { useCallback, useEffect, useRef, useState } from 'react';
import { FEED_SIZE, type FeedEvent, mergeFeed } from '../activity.ts';
import {
  fetchCollections,
  fetchEvents,
  fetchItems,
  fetchPresets,
  fetchProject,
  fetchProjects,
  fetchSession,
} from '../api.ts';
import { type Connection, useBeat, useLive, useRemote } from '../hooks.ts';
import type { Agent } from '../presence.ts';
import type { Remote } from '../remote.ts';
import type { CollectionView, Item, PresetView, ProjectOverview, ProjectView } from '../types.ts';
import { useAgents } from '../use-agents.ts';

// Everything the app reads from the server, kept live (moved out of App.tsx): the stream, the
// items, the session, the project and the others on this machine, the boards and presets (read
// again when Studio writes), the agents, and the project's feed of events.

export type Session = { canWrite: boolean; canConfigure: boolean; canManageDevices: boolean };

export type LoadedData = {
  connection: Connection;
  version: number;
  presence: number;
  now: number;
  session: Session;
  project?: ProjectView;
  projects?: ProjectOverview[];
  items: Remote<Item[]>;
  all: Item[];
  collections: CollectionView[];
  presets: PresetView[];
  presetsRemote: Remote<PresetView[]>;
  agents: Agent[] | null | undefined;
  feed: FeedEvent[];
  studioWrites: number;
  studioChanged(): void;
};

const ready = <T>(r: Remote<T>): T | undefined => (r.status === 'ready' ? r.value : undefined);

// The project's latest events, then the ones after the last on every change.
export function useFeed(version: number, connection: Connection): FeedEvent[] {
  const [feed, setFeed] = useState<{ events: FeedEvent[]; loaded: boolean }>({
    events: [],
    loaded: false,
  });
  const current = useRef(feed);
  current.current = feed;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version means the log grew
  useEffect(() => {
    if (connection !== 'live') return;
    const controller = new AbortController();
    const { loaded, events } = current.current;
    const query = loaded ? { since: events.at(-1)?.id ?? 0 } : { latest: FEED_SIZE };
    fetchEvents(query, controller.signal).then(
      (arrived) => setFeed((was) => ({ events: mergeFeed(was.events, arrived), loaded: true })),
      () => undefined,
    );
    return () => controller.abort();
  }, [version, connection]);
  return feed.events;
}

export function useAppData(): LoadedData {
  const { connection, version, presence } = useLive();
  const beat = useBeat(30_000);
  const now = useNow(beat);
  const items = useRemote(fetchItems, version, connection);
  const session = useRemote(fetchSession, 0, connection);
  const [studioWrites, setStudioWrites] = useState(0);
  const collections = useRemote(fetchCollections, studioWrites, connection);
  const presets = useRemote(fetchPresets, studioWrites, connection);
  const project = useRemote(fetchProject, 0, connection);
  // Other projects are not on this server's stream: read again as this one changes, and on the beat.
  const projects = useRemote(fetchProjects, version * 1000 + beat, connection);
  const agents = useAgents(version, presence, connection);
  const feed = useFeed(version, connection);
  const studioChanged = useCallback(() => setStudioWrites((n) => n + 1), []);
  const s = ready(session);
  const data: LoadedData = {
    connection,
    version,
    presence,
    now,
    session: {
      canWrite: s?.canWrite === true,
      canConfigure: s?.canConfigure === true,
      canManageDevices: s?.canManageDevices === true,
    },
    items,
    all: ready(items) ?? [],
    collections: ready(collections) ?? [],
    presets: ready(presets) ?? [],
    presetsRemote: presets,
    agents,
    feed,
    studioWrites,
    studioChanged,
  };
  const p = ready(project);
  if (p) data.project = p;
  const ps = ready(projects);
  if (ps) data.projects = ps;
  return data;
}

// The time, read again on each beat.
function useNow(beat: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (beat > 0) setNow(Date.now());
  }, [beat]);
  return now;
}
