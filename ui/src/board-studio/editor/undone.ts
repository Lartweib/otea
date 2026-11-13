import { t } from '../../i18n/i18n.ts';

// Deshacer on a publish puts the version before back live and returns the undone version's changes
// to the draft. The toast says so once; this says it for as long as the draft still holds them, so
// a change that looked undone never sits in the draft unexplained. A version newer than the live
// one (or any version, on a board no longer live) is a publish that was undone.

export function undoneNotice(
  record: { live: { version: number } | null; versions: readonly { version: number }[] },
  dirty: boolean,
): string | null {
  if (!dirty) return null;
  const latest = Math.max(0, ...record.versions.map(({ version }) => version));
  const live = record.live?.version ?? null;
  if (latest === 0 || (live !== null && latest <= live)) return null;
  return live === null
    ? t('bs.editor.undone_first')
    : t('bs.editor.undone', { undone: latest, live });
}
