import type { NotifyKind, Signal } from './signals.ts';

// When and how the signals of one listener (a phone's subscription, the desktop app) go out:
// - the kinds the person turned off never do, nor anything from a project they muted;
// - a burst gathers for a moment and goes as one notice ("3 cosas te tocan en tienda-web");
// - after a notice the next waits a couple of minutes, gathering all that comes meanwhile into
//   one: many agents taking items make one notice now and then, never a stream;
// - an item's news collapses into one notice (its turn first), and an item is told about at most
//   once every few minutes: news about it meanwhile waits, and goes if it still holds after;
// - in the quiet hours nothing goes, and nothing is caught up afterwards: the app has it all.

// "HH:MM", in this computer's time.
export type QuietHours = { from: string; to: string };

export type NotifyPrefs = Record<NotifyKind, boolean> & {
  quiet: QuietHours | null;
  // The projects (their ids) nothing is told from.
  muted: string[];
};

// What matters to the person on: what is theirs (a review, a question), an answer, a stuck item.
// An agent setting something aside is theirs to look up, not to be told about, until they ask.
export const DEFAULT_PREFS: NotifyPrefs = {
  turn: true,
  ask: true,
  replied: true,
  stuck: true,
  aside: false,
  quiet: null,
  muted: [],
};

// The quiet hours offered when the person turns them on.
export const DEFAULT_QUIET: QuietHours = { from: '22:00', to: '08:00' };

export const GATHER_MS = 10_000;
export const ITEM_COOLDOWN_MS = 5 * 60_000;
// The least time between two notices to one listener from one project.
export const SPACING_MS = 2 * 60_000;

export type ItemNotice = {
  kind: NotifyKind;
  item: string;
  title: string;
  by?: string;
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

// Of an item's news, the one told: a question first, its turn, that it got stuck, then the rest.
const RANK: Record<NotifyKind, number> = { ask: 0, turn: 1, stuck: 2, replied: 3, aside: 4 };

function noticeOf(signal: Signal): ItemNotice {
  const { kind, item, title, by } = signal;
  return { kind, item, title, ...(by === undefined ? {} : { by }) };
}

export class Planner {
  private pending: Signal[] = [];
  private due: number | null = null;
  private readonly told = new Map<string, number>();
  private sentAt: number | null = null;
  private readonly minuteOfDay: (ms: number) => number;
  // The project whose signals this planner hears, for the person's muted projects.
  private readonly project: string | undefined;

  constructor(minuteOfDay: (ms: number) => number = localMinuteOfDay, project?: string) {
    this.minuteOfDay = minuteOfDay;
    this.project = project;
  }

  private wants(kind: NotifyKind, prefs: NotifyPrefs): boolean {
    return prefs[kind] && !(this.project !== undefined && prefs.muted.includes(this.project));
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  offer(signals: readonly Signal[], prefs: NotifyPrefs, now: number): void {
    const wanted = signals.filter(
      ({ kind, key }) => this.wants(kind, prefs) && !this.pending.some((held) => held.key === key),
    );
    if (wanted.length === 0) return;
    this.pending.push(...wanted);
    this.due ??= now + GATHER_MS;
  }

  // What goes out now, if anything: one notice, for one item or for the burst. `holding` are the
  // keys of what is true now.
  take(now: number, holding: ReadonlySet<string>, prefs: NotifyPrefs): Notice[] {
    if (this.due === null || now < this.due) return [];
    const spaced = this.sentAt === null ? now : this.sentAt + SPACING_MS;
    if (now < spaced) {
      this.due = spaced;
      return [];
    }
    for (const [item, at] of this.told) if (at + ITEM_COOLDOWN_MS <= now) this.told.delete(item);
    this.pending = this.pending.filter(
      ({ key, kind }) => holding.has(key) && this.wants(kind, prefs),
    );
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
    this.sentAt = now;
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
