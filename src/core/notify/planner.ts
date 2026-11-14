import type { NotifyKind, Signal } from './signals.ts';

// When and how the signals of one listener (a phone's subscription, the desktop app) go out:
// - the kinds the person turned off never do;
// - a burst gathers for a moment and goes as one notice ("3 cosas te tocan");
// - an item is told about at most once every few minutes: news about it meanwhile waits, and goes
//   if it still holds once they are over;
// - in the quiet hours nothing goes, and nothing is caught up afterwards: the app has it all.

// "HH:MM", in this computer's time.
export type QuietHours = { from: string; to: string };

export type NotifyPrefs = {
  turn: boolean;
  replied: boolean;
  stuck: boolean;
  quiet: QuietHours | null;
};

export const DEFAULT_PREFS: NotifyPrefs = { turn: true, replied: true, stuck: true, quiet: null };

// The quiet hours offered when the person turns them on.
export const DEFAULT_QUIET: QuietHours = { from: '22:00', to: '08:00' };

export const GATHER_MS = 10_000;
export const ITEM_COOLDOWN_MS = 5 * 60_000;

export type ItemNotice = {
  kind: NotifyKind;
  item: string;
  title: string;
  by?: string;
  asks?: true;
};

export type GroupNotice = {
  kind: 'group';
  count: number;
  // What the items have in common, or mixed.
  of: NotifyKind | 'mixed';
  items: { item: string; title: string; kind: NotifyKind }[];
};

export type Notice = ItemNotice | GroupNotice;

export const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function inQuietHours(quiet: QuietHours | null, minuteOfDay: number): boolean {
  if (!quiet) return false;
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  if (from === to) return false;
  return from < to
    ? minuteOfDay >= from && minuteOfDay < to
    : minuteOfDay >= from || minuteOfDay < to;
}

export const localMinuteOfDay = (ms: number): number => {
  const date = new Date(ms);
  return date.getHours() * 60 + date.getMinutes();
};

// Of an item's news, the one told: its turn first, then that it got stuck, then an answer.
const RANK: Record<NotifyKind, number> = { turn: 0, stuck: 1, replied: 2 };

function noticeOf(signal: Signal): ItemNotice {
  const { kind, item, title, by, asks } = signal;
  return {
    kind,
    item,
    title,
    ...(by === undefined ? {} : { by }),
    ...(asks ? { asks } : {}),
  };
}

export class Planner {
  private pending: Signal[] = [];
  private due: number | null = null;
  private readonly told = new Map<string, number>();
  private readonly minuteOfDay: (ms: number) => number;

  constructor(minuteOfDay: (ms: number) => number = localMinuteOfDay) {
    this.minuteOfDay = minuteOfDay;
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  offer(signals: readonly Signal[], prefs: NotifyPrefs, now: number): void {
    const wanted = signals.filter(
      ({ kind, key }) => prefs[kind] && !this.pending.some((held) => held.key === key),
    );
    if (wanted.length === 0) return;
    this.pending.push(...wanted);
    this.due ??= now + GATHER_MS;
  }

  // What goes out now, if anything: one notice, for one item or for the burst. `holding` are the
  // keys of what is true now.
  take(now: number, holding: ReadonlySet<string>, prefs: NotifyPrefs): Notice[] {
    if (this.due === null || now < this.due) return [];
    for (const [item, at] of this.told) if (at + ITEM_COOLDOWN_MS <= now) this.told.delete(item);
    this.pending = this.pending.filter(({ key, kind }) => holding.has(key) && prefs[kind]);
    const byItem = new Map<string, Signal>();
    for (const signal of this.pending) {
      const held = byItem.get(signal.item);
      if (!held || RANK[signal.kind] < RANK[held.kind]) byItem.set(signal.item, signal);
    }
    const ready: Signal[] = [];
    let wait: number | null = null;
    for (const [item, signal] of byItem) {
      const free = (this.told.get(item) ?? Number.NEGATIVE_INFINITY) + ITEM_COOLDOWN_MS;
      if (free <= now) ready.push(signal);
      else wait = Math.min(wait ?? free, free);
    }
    const out = new Set(ready.map(({ item }) => item));
    this.pending = this.pending.filter(({ item }) => !out.has(item));
    this.due = wait;
    if (ready.length === 0 || inQuietHours(prefs.quiet, this.minuteOfDay(now))) return [];
    for (const { item } of ready) this.told.set(item, now);
    const [only] = ready;
    if (ready.length === 1 && only) return [noticeOf(only)];
    const kinds = new Set(ready.map(({ kind }) => kind));
    const [same] = kinds;
    return [
      {
        kind: 'group',
        count: ready.length,
        of: kinds.size === 1 && same ? same : 'mixed',
        items: ready.map(({ item, title, kind }) => ({ item, title, kind })),
      },
    ];
  }
}
