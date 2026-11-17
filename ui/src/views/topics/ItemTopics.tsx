import { useCallback, useState } from 'react';
import { answerTopicSuggestion, closeTopicNow, fetchItemTopics } from '../../api.ts';
import { useApp } from '../../app/context.tsx';
import { useRemote } from '../../hooks.ts';
import { t } from '../../i18n/i18n.ts';
import { Button, GhostButton, toast } from '../../kit/index.ts';
import { topicsHash } from '../../selection.ts';
import { pendingTopics } from '../../topics.ts';
import type { ItemView } from '../../types.ts';

// An item's side topics: the ones it came from or a person linked, those still waiting on someone
// marked; a topic it may have come from, to link or wave off; while it is your turn, one line that
// an open topic is about it; once it is finished, the offer to close those topics. Nothing at all
// when it has none.
export function ItemTopics({ item, canWrite }: { item: ItemView; canWrite: boolean }) {
  const app = useApp();
  const [bump, setBump] = useState(0);
  const load = useCallback((signal: AbortSignal) => fetchItemTopics(item.id, signal), [item.id]);
  const remote = useRemote(load, app.version + bump, app.connection);
  if (remote.status !== 'ready') return null;
  const { linked, suggested } = remote.value;
  if (linked.length === 0 && suggested.length === 0) return null;
  const pending = pendingTopics(linked);
  const ids = pending.map(({ id }) => id).join(', ');
  const fail = (error: unknown) =>
    toast({ msg: error instanceof Error ? error.message : String(error) });
  const answer = (topic: string, choice: 'confirm' | 'dismiss') =>
    answerTopicSuggestion(item.id, topic, choice).then(() => setBump((n) => n + 1), fail);
  const closeAll = () =>
    Promise.all(pending.map(({ id }) => closeTopicNow(id))).then(() => {
      toast({ msg: t('topics.closed', { id: ids }) });
      setBump((n) => n + 1);
    }, fail);
  return (
    <section className="d-sec tp-item" data-key="topics">
      <div className="margin-label">{t('topics.related')}</div>
      <div className="d-body">
        {pending.length > 0 && item.turn === 'human' ? (
          <p className="tp-hint">{t('topics.review.hint', { ids })}</p>
        ) : null}
        {pending.length > 0 && item.turn === 'none' && canWrite ? (
          <p className="tp-hint tp-done">
            {t('topics.done.offer', { ids })}{' '}
            <Button size="sm" onClick={closeAll}>
              {t('topics.done.close')}
            </Button>
          </p>
        ) : null}
        {linked.length > 0 ? (
          <ul className="tp-item-list">
            {linked.map((topic) => (
              <li key={topic.id}>
                <a href={topicsHash(topic.id)}>
                  <span className="tp-id">{topic.id}</span> {topic.title}
                </a>
                {topic.pending ? (
                  <span className="tp-pending"> · {t('topics.related.pending')}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {canWrite
          ? suggested.map((topic) => (
              <p key={topic.id} className="tp-suggest">
                <span>{t('topics.suggest', { id: topic.id, title: topic.title })}</span>{' '}
                <Button size="sm" onClick={() => answer(topic.id, 'confirm')}>
                  {t('topics.suggest.confirm')}
                </Button>
                <GhostButton onClick={() => answer(topic.id, 'dismiss')}>
                  {t('topics.suggest.dismiss')}
                </GhostButton>
              </p>
            ))
          : null}
      </div>
    </section>
  );
}
