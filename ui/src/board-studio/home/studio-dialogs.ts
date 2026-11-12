import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Lang } from '../../../../src/core/board/templates.ts';
import { fetchTemplates, type TemplateView } from '../api.ts';

// Which of Studio's creation dialogs is open, wherever it was asked from (the home's plates and
// templates, the rail's Nuevo tablero, the phone's sheet); App renders them once.

export type StudioDialog =
  | { kind: 'new'; template: string | null; n: number }
  | { kind: 'agent'; n: number }
  | null;

let open: StudioDialog = null;
let n = 0;
const listeners = new Set<() => void>();
const set = (next: StudioDialog) => {
  open = next;
  for (const fn of listeners) fn();
};

export const openNewBoard = (template: string | null = null) =>
  set({ kind: 'new', template, n: ++n });
export const openAgentDraft = () => set({ kind: 'agent', n: ++n });
export const closeStudioDialog = () => set(null);

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useStudioDialog(): StudioDialog {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => null,
  );
}

// The templates in a language, read once per language and kept; a failure says why.
export type TemplatesState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; templates: TemplateView[] };

const cache = new Map<Lang, TemplateView[]>();

export function useTemplates(lang: Lang): { state: TemplatesState; retry: () => void } {
  const [tries, setTries] = useState(0);
  const [state, setState] = useState<TemplatesState>(() => {
    const kept = cache.get(lang);
    return kept ? { status: 'ready', templates: kept } : { status: 'loading' };
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: a retry reads them again
  useEffect(() => {
    const kept = cache.get(lang);
    if (kept) {
      setState({ status: 'ready', templates: kept });
      return;
    }
    setState({ status: 'loading' });
    const controller = new AbortController();
    fetchTemplates(lang, controller.signal).then(
      (templates) => {
        cache.set(lang, templates);
        setState({ status: 'ready', templates });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => controller.abort();
  }, [lang, tries]);
  return { state, retry: () => setTries((k) => k + 1) };
}

// The agent each waiting board was asked of, as this browser asked it (the server keeps the
// request; this only words "esperando el esbozo de Kiln" until the request names its holder).
const DRAFTERS = 'otea.studio.drafters';

export function rememberDrafter(board: string, agent: string | null): void {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFTERS) ?? '{}') as Record<string, string>;
    if (agent) all[board] = agent;
    else delete all[board];
    localStorage.setItem(DRAFTERS, JSON.stringify(all));
  } catch {
    // Storage may be off: the status then says "un agente".
  }
}

export function drafterOf(board: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFTERS) ?? '{}') as Record<string, string>;
    return all[board] ?? null;
  } catch {
    return null;
  }
}
