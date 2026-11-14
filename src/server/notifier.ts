import { listItems } from '../app/items.ts';
import { boardRoundOf, liveBoards } from '../app/next.ts';
import { notesSummary } from '../app/notes.ts';
import {
  DESKTOP,
  desktopChosen,
  desktopTarget,
  dropEndpoint,
  listTargets,
  type NotifyTarget,
} from '../app/notify-targets.ts';
import type { Project } from '../app/project.ts';
import { localMinuteOfDay, Planner } from '../core/notify/planner.ts';
import { freshSignals, type NotifyFacts, signalsOf } from '../core/notify/signals.ts';
import { type NoticeLang, type NoticeText, noticeText } from '../core/notify/text.ts';
import type { ChangeFeed } from './changes.ts';
import type { PushSender } from './push.ts';

// The server's side of notifications: it looks at the items on every change (and every few
// seconds, since a lease runs out without writing anything), finds what is new (core/notify), and
// hands each listener its notices: a push to every subscribed device, and to the desktop app, when
// it listens, its notices for the system's notifications. It looks only while someone listens.

export type DesktopListener = (text: NoticeText) => void;

export type Notifier = {
  // Looks at the items now.
  scan(): void;
  // Someone subscribed or left: starts or stops looking.
  refresh(): void;
  // The desktop app listens; `lang` words its notices until it chooses one in Preferencias, and
  // `end` is called when the server closes.
  listenDesktop(listener: DesktopListener, lang: NoticeLang, end?: () => void): () => void;
  // Every push sent so far has been answered (tests).
  settled(): Promise<void>;
  close(): void;
};

export type NotifierOptions = {
  sender: PushSender;
  now?: () => number;
  minuteOfDay?: (ms: number) => number;
  tickMs?: number;
};

const TICK_MS = 5000;

function factsOf(project: Project, now: number): NotifyFacts[] {
  const boards = liveBoards(project);
  return listItems(project, {}, () => new Date(now).toISOString()).map((item) => {
    const round = boardRoundOf(project, item, boards);
    const notes = notesSummary(project, item, boards);
    return {
      ...item,
      ...(round === undefined ? {} : { round }),
      ...(notes === undefined ? {} : { notes }),
    };
  });
}

export function createNotifier(
  project: Project,
  feed: ChangeFeed,
  options: NotifierOptions,
): Notifier {
  const now = options.now ?? Date.now;
  const minuteOfDay = options.minuteOfDay ?? localMinuteOfDay;
  const planners = new Map<string, Planner>();
  const desktop = new Map<DesktopListener, { lang: NoticeLang; end?: () => void }>();
  const sending = new Set<Promise<void>>();
  let seen: Set<string> | undefined;
  let stopFeed: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const push = (target: NotifyTarget, text: NoticeText) => {
    const subscription = target.push;
    if (!subscription) return;
    const sent = options.sender
      .send(subscription, JSON.stringify(text))
      .then((result) => {
        if (result !== 'gone') return;
        dropEndpoint(project.db, subscription.endpoint);
        refresh();
      })
      .catch(() => {})
      .finally(() => sending.delete(sent));
    sending.add(sent);
  };

  const listeners = (): NotifyTarget[] => {
    const targets = listTargets(project.db);
    if (desktop.size > 0) targets.push(desktopTarget(project.db));
    return targets;
  };

  const scan = () => {
    const at = now();
    let signals: ReturnType<typeof signalsOf>;
    try {
      signals = signalsOf(factsOf(project, at), at);
    } catch {
      return;
    }
    const fresh = freshSignals(seen, signals);
    seen = new Set(signals.map(({ key }) => key));
    const targets = listeners();
    for (const id of planners.keys()) {
      if (!targets.some((target) => target.id === id)) planners.delete(id);
    }
    for (const target of targets) {
      let planner = planners.get(target.id);
      if (!planner) {
        planner = new Planner(minuteOfDay);
        planners.set(target.id, planner);
      }
      planner.offer(fresh, target.prefs, at);
      for (const notice of planner.take(at, seen, target.prefs)) {
        if (target.id !== DESKTOP) {
          push(target, noticeText(notice, target.lang));
          continue;
        }
        // The language chosen in Preferencias, once it was; else the system's.
        const chose = desktopChosen(project.db);
        for (const [listener, { lang }] of desktop) {
          listener(noticeText(notice, chose ? target.lang : lang));
        }
      }
    }
  };

  const stop = () => {
    stopFeed?.();
    stopFeed = undefined;
    clearInterval(timer);
    timer = undefined;
    seen = undefined;
    planners.clear();
  };

  const refresh = () => {
    let wanted = desktop.size > 0;
    try {
      wanted ||= listTargets(project.db).length > 0;
    } catch {
      wanted = false;
    }
    if (wanted && !stopFeed) {
      stopFeed = feed.subscribe(scan);
      timer = setInterval(scan, options.tickMs ?? TICK_MS);
      timer.unref?.();
      scan();
    } else if (!wanted && stopFeed) stop();
  };

  return {
    scan,
    refresh,
    listenDesktop(listener, lang, end) {
      desktop.set(listener, end ? { lang, end } : { lang });
      refresh();
      return () => {
        desktop.delete(listener);
        refresh();
      };
    },
    async settled() {
      while (sending.size > 0) await Promise.all(sending);
    },
    close() {
      const open = [...desktop.values()];
      desktop.clear();
      for (const { end } of open) end?.();
      stop();
    },
  };
}
