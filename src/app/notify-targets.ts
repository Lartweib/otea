import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import { DEFAULT_PREFS, type NotifyPrefs, TIME_PATTERN } from '../core/notify/planner.ts';
import { isNoticeLang, type NoticeLang } from '../core/notify/text.ts';

// Who is told when something becomes yours, and how they want it (see core/notify):
// - a paired device that subscribed to Web Push from Preferencias › Avisos; the subscription goes
//   with the device when it is unpaired (ON DELETE CASCADE);
// - the desktop app, which shows the same notices as the system's own notifications; it has no
//   subscription, only its prefs.

export const DESKTOP = 'desktop';

export type PushEndpoint = { endpoint: string; p256dh: string; auth: string };

export type NotifyTarget = {
  id: string;
  device: string | null;
  push: PushEndpoint | null;
  lang: NoticeLang;
  prefs: NotifyPrefs;
};

type TargetRow = {
  id: string;
  device: string | null;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  lang: string;
  prefs: string;
};

const deviceTarget = (device: string) => `device:${device}`;

const isQuiet = (value: unknown): value is NotifyPrefs['quiet'] => {
  if (value === null) return true;
  const quiet = value as { from?: unknown; to?: unknown } | undefined;
  return (
    typeof quiet?.from === 'string' &&
    TIME_PATTERN.test(quiet.from) &&
    typeof quiet.to === 'string' &&
    TIME_PATTERN.test(quiet.to)
  );
};

// What was kept, over the defaults: a value that does not read is the default's.
function readPrefs(text: string): NotifyPrefs {
  let kept: Partial<Record<keyof NotifyPrefs, unknown>> = {};
  try {
    kept = JSON.parse(text) ?? {};
  } catch {
    // the defaults
  }
  const flag = (key: 'turn' | 'replied' | 'stuck') =>
    typeof kept[key] === 'boolean' ? kept[key] : DEFAULT_PREFS[key];
  return {
    turn: flag('turn'),
    replied: flag('replied'),
    stuck: flag('stuck'),
    quiet: isQuiet(kept.quiet) ? kept.quiet : DEFAULT_PREFS.quiet,
  };
}

function toTarget(row: TargetRow): NotifyTarget {
  const { endpoint, p256dh, auth } = row;
  return {
    id: row.id,
    device: row.device,
    push: endpoint && p256dh && auth ? { endpoint, p256dh, auth } : null,
    lang: isNoticeLang(row.lang) ? row.lang : 'en',
    prefs: readPrefs(row.prefs),
  };
}

// The subscriptions to push to.
export function listTargets(db: DatabaseSync): NotifyTarget[] {
  const rows = db
    .prepare('SELECT * FROM notify_targets WHERE endpoint IS NOT NULL ORDER BY created_at, id')
    .all() as TargetRow[];
  return rows.map(toTarget);
}

export function targetOfDevice(db: DatabaseSync, device: string): NotifyTarget | undefined {
  const row = db.prepare('SELECT * FROM notify_targets WHERE device = ?').get(device) as
    | TargetRow
    | undefined;
  return row ? toTarget(row) : undefined;
}

// A device subscribes, or subscribes again (a new endpoint): the prefs it chose stay.
export function saveSubscription(
  db: DatabaseSync,
  device: string,
  push: PushEndpoint,
  lang: NoticeLang,
  now = new Date(),
): NotifyTarget {
  const prefs = targetOfDevice(db, device)?.prefs ?? DEFAULT_PREFS;
  // A browser hands the same endpoint to whoever paired last on it.
  db.prepare('DELETE FROM notify_targets WHERE endpoint = ? AND device IS NOT ?').run(
    push.endpoint,
    device,
  );
  db.prepare(
    `INSERT INTO notify_targets (id, device, endpoint, p256dh, auth, lang, prefs, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh,
       auth = excluded.auth, lang = excluded.lang`,
  ).run(
    deviceTarget(device),
    device,
    push.endpoint,
    push.p256dh,
    push.auth,
    lang,
    JSON.stringify(prefs),
    now.toISOString(),
  );
  return targetOfDevice(db, device) as NotifyTarget;
}

export function savePrefs(
  db: DatabaseSync,
  device: string,
  prefs: NotifyPrefs,
  lang: NoticeLang,
): NotifyTarget {
  const updated = db
    .prepare('UPDATE notify_targets SET prefs = ?, lang = ? WHERE device = ?')
    .run(JSON.stringify(prefs), lang, device);
  if (updated.changes === 0) {
    throw new OteaError('not_found', 'This device is not subscribed to notifications');
  }
  return targetOfDevice(db, device) as NotifyTarget;
}

export function dropSubscription(db: DatabaseSync, device: string): void {
  db.prepare('DELETE FROM notify_targets WHERE device = ?').run(device);
}

// The push service said the subscription is gone (404 or 410).
export function dropEndpoint(db: DatabaseSync, endpoint: string): void {
  db.prepare('DELETE FROM notify_targets WHERE endpoint = ?').run(endpoint);
}

export function desktopTarget(db: DatabaseSync): NotifyTarget {
  const row = db.prepare('SELECT * FROM notify_targets WHERE id = ?').get(DESKTOP) as
    | TargetRow
    | undefined;
  return row
    ? toTarget(row)
    : { id: DESKTOP, device: null, push: null, lang: 'en', prefs: DEFAULT_PREFS };
}

// Whether the desktop app's prefs were ever chosen in Preferencias (its language with them).
export function desktopChosen(db: DatabaseSync): boolean {
  return db.prepare('SELECT 1 FROM notify_targets WHERE id = ?').get(DESKTOP) !== undefined;
}

export function saveDesktopPrefs(
  db: DatabaseSync,
  prefs: NotifyPrefs,
  lang: NoticeLang,
  now = new Date(),
): NotifyTarget {
  db.prepare(
    `INSERT INTO notify_targets (id, lang, prefs, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET lang = excluded.lang, prefs = excluded.prefs`,
  ).run(DESKTOP, lang, JSON.stringify(prefs), now.toISOString());
  return desktopTarget(db);
}
