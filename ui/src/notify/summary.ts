import type { NotifyPrefs } from '../../../src/core/notify/planner.ts';
import type { NotifyKind } from '../../../src/core/notify/signals.ts';
import { type PlainKey, t } from '../i18n/i18n.ts';

// What a paired device chose to be told (Preferencias › Avisos), in one line for the desk's device
// list: the kinds on, the quiet hours, how many projects are muted; or that it has them off.

const SHORT: readonly [NotifyKind, PlainKey][] = [
  ['turn', 'notify.short.turn'],
  ['ask', 'notify.short.ask'],
  ['replied', 'notify.short.replied'],
  ['stuck', 'notify.short.stuck'],
  ['aside', 'notify.short.aside'],
];

export function notifySummary(prefs: NotifyPrefs | null | undefined): string {
  if (!prefs) return t('notify.summary.off');
  const kinds = SHORT.filter(([kind]) => prefs[kind]).map(([, key]) => t(key));
  if (kinds.length === 0) return t('notify.summary.none');
  const parts = [...kinds];
  if (prefs.quiet) parts.push(t('notify.summary.quiet', prefs.quiet));
  if (prefs.muted.length > 0) parts.push(t('notify.summary.muted', { count: prefs.muted.length }));
  return t('notify.summary.on', { what: parts.join(' · ') });
}
