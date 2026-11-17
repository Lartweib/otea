import { useCallback } from 'react';
import { fetchTopics } from '../../api.ts';
import { useApp } from '../../app/context.tsx';
import { useRemote } from '../../hooks.ts';
import type { TopicsView } from '../../topics.ts';

// The project's side topics as the rail and Te toca read them: none while they are off and none
// were kept. Read again whenever the project changes.
export function useTopics(): TopicsView | undefined {
  const app = useApp();
  const load = useCallback((signal: AbortSignal) => fetchTopics(signal), []);
  const remote = useRemote(load, app.version, app.connection);
  return remote.status === 'ready' ? remote.value : undefined;
}

// Whether the topics page has anything to show: topics on, or some kept from when they were.
export function topicsShown(view: TopicsView | undefined): boolean {
  return !!view && (view.on || view.topics.length > 0);
}
