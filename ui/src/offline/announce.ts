import { PHONE_QUERY } from '../hooks.ts';
import { t } from '../i18n/i18n.ts';
import { toast } from '../kit/pop/toast.tsx';
import type { Flushed } from './capture-queue.ts';

// The quiet notes of the installed app: a new version took over, and the queue went out.

// Under the top bar on the phone, where the foot is the thumb's.
const at = () => (window.matchMedia(PHONE_QUERY).matches ? { at: 'top' as const } : {});

// The toasts' host shows only what is sent once it is up: the note waits for the app to draw, and
// for the person to look (the page may have reloaded into the new version in the background).
const AFTER_DRAW_MS = 1200;

export function announceUpdated(): void {
  const show = () => setTimeout(() => toast({ msg: t('offline.updated'), ...at() }), AFTER_DRAW_MS);
  if (document.visibilityState !== 'hidden') return void show();
  const once = () => {
    if (document.visibilityState === 'hidden') return;
    document.removeEventListener('visibilitychange', once);
    show();
  };
  document.addEventListener('visibilitychange', once);
}

export function announceFlushed(out: Flushed): void {
  const [first] = out.made;
  if (first) {
    const msg =
      out.made.length === 1
        ? t('offline.sentOne', { title: first.capture.fields.title ?? '', id: first.item })
        : t('offline.sentMany', { n: out.made.length });
    setTimeout(() => toast({ msg, ...at() }), 0);
  }
  const [refused] = out.refused;
  if (refused) {
    const msg = t('offline.refused', { title: refused.fields.title ?? '' });
    setTimeout(() => toast({ msg, ...at() }), out.made.length > 0 ? 2500 : 0);
  }
}
