import type { DatabaseSync } from 'node:sqlite';
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
import { setAsideOf } from '../app/set-aside.ts';
import { localMinuteOfDay, type Notice, Planner } from '../core/notify/planner.ts';
import { freshSignals, type NotifyFacts, signalsOf } from '../core/notify/signals.ts';
import { type NoticeLang, type NoticeText, noticeText } from '../core/notify/text.ts';
import { selectEvents } from '../store/queries.ts';
import type { ChangeFeed } from './changes.ts';
import type { PushSender } from './push.ts';
import { outcomeLine } from './test-push.ts';

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
  // Where the devices and the desktop app that listen are kept: the machine store, shared by every
  // project this server serves (app/machine.ts).
  targets: DatabaseSync;
  now?: () => number;
  minuteOfDay?: (ms: number) => number;
  tickMs?: number;
  // Where each push's outcome is told (otea serve's output): the device id, never its endpoint.
  log?: (line: string) => void;
};

const TICK_MS = 5000;

function factsOf(project: Project, now: number): NotifyFacts[] {
  const boards = liveBoards(project);
  return listItems(project, {}, () => new Date(now).toISOString()).map((item) => {
    const round = boardRoundOf(project, item, boards);
    const notes = notesSummary(project, item, boards);
    const setAside =
      item.turn === 'agent' ? setAsideOf(selectEvents(project.db, item.id)) : undefined;
    return {
      ...item,
      ...(round === undefined ? {} : { round }),
      ...(notes === undefined ? {} : { notes }),
      ...(setAside === undefined ? {} : { setAside }),
    };
  });
}

export function createNotifier(
  project: Project,
  feed: ChangeFeed,
  options: NotifierOptions,
): Notifier {
  const targetsDb = options.targets;
  // A notice names its project and opens it: one phone and one desktop app hear every project.
  // A burst says it in its own words ("3 cosas te tocan en tienda-web").
  const { id, name } = project.identity;
  const words = (notice: Notice, lang: NoticeLang): NoticeText => {
    const text = noticeText(notice, lang, { id, name });
    return {
      ...text,
      title: notice.kind === 'group' ? text.title : `${name} · ${text.title}`,
      url: `/p/${id}${text.url}`,
    };
  };
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
      .then((outcome) => {
        options.log?.(
          `Otea ${outcomeLine(`push to device ${target.device ?? target.id}`, outcome)}`,
        );
        if (outcome.result !== 'gone') return;
        dropEndpoint(targetsDb, subscription.endpoint);
        refresh();
      })
      .catch((error: unknown) => {
        options.log?.(`Otea push to device ${target.device ?? target.id}: ${String(error)}`);
      })
      .finally(() => sending.delete(sent));
    sending.add(sent);
  };

  const listeners = (): NotifyTarget[] => {
    const targets = listTargets(targetsDb);
    if (desktop.size > 0) targets.push(desktopTarget(targetsDb));
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
        planner = new Planner(minuteOfDay, id);
        planners.set(target.id, planner);
      }
      planner.offer(fresh, target.prefs, at);
      for (const notice of planner.take(at, seen, target.prefs)) {
        if (target.id !== DESKTOP) {
          push(target, words(notice, target.lang));
          continue;
        }
        // The language chosen in Preferencias, once it was; else the system's.
        const chose = desktopChosen(targetsDb);
        for (const [listener, { lang }] of desktop) {
          listener(words(notice, chose ? target.lang : lang));
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
      wanted ||= listTargets(targetsDb).length > 0;
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
