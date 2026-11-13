import { t } from '../i18n/i18n.ts';
import { Button } from '../kit/index.ts';
import type { QueuedCapture } from './capture-queue.ts';

// Te toca's "En cola": what was captured while the PC did not answer, each with its board and
// "en cola" until it goes. One the PC refused when it went (a board changed meanwhile) stays here,
// with its words, until the person discards it: nothing captured is lost without them.

export type QueuedCapturesProps = {
  captures: readonly QueuedCapture[];
  onDiscard: (id: string) => void;
};

export function QueuedCaptures({ captures, onDiscard }: QueuedCapturesProps) {
  if (captures.length === 0) return null;
  return (
    <section className="queued" aria-label={t('offline.queue.title')} data-leaf="">
      <h2 className="q-head">
        {t('offline.queue.title')} <span className="q-n">{captures.length}</span>
      </h2>
      <p className="q-note">{t('offline.queue.note')}</p>
      <ul className="q-list">
        {captures.map((c) => (
          <li key={c.id} className="q-row" data-refused={c.refused === undefined ? undefined : ''}>
            <span className="q-title">{c.fields.title}</span>
            <span className="q-meta">
              {c.board} ·{' '}
              {c.refused === undefined ? (
                <span className="q-tag">{t('offline.queue.waiting')}</span>
              ) : (
                <span className="q-err">{t('offline.queue.refused', { message: c.refused })}</span>
              )}
            </span>
            {c.refused === undefined ? null : (
              <Button size="sm" variant="quiet" onClick={() => onDiscard(c.id)}>
                {t('offline.queue.discard')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
