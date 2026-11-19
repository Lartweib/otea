import { t } from '../../i18n/i18n.ts';
import { topicsHash } from '../../selection.ts';
import { answeredTopics, capped, conclusionOf } from '../../topics.ts';
import { useTopics } from './use-topics.ts';

// Te toca's folded group of side topics an agent answered: your turn, but never work, so they sit
// below the lanes, folded, one line each; a line opens the topic. A few at most: the rest wait on
// the topics page, so a chatty day never floods Te toca (P4-12).
export function AnsweredTopics() {
  const view = useTopics();
  const answered = answeredTopics(view?.topics ?? []);
  if (answered.length === 0) return null;
  const { shown, more } = capped(answered);
  return (
    <details className="tp-toca">
      <summary>
        {t('topics.toca.group')} <span className="n">({answered.length})</span>
      </summary>
      <p className="tp-toca-hint">{t('topics.toca.hint')}</p>
      <ul>
        {shown.map((topic) => (
          <li key={topic.id}>
            <a className="tp-row" href={topicsHash(topic.id)}>
              <span className="tp-id">{topic.id}</span>
              <span className="tp-title">{topic.title}</span>
              {conclusionOf(topic) ? (
                <span className="tp-sum">{conclusionOf(topic)?.text}</span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <a className="tp-more" href={topicsHash()}>
          {t('topics.toca.more', { count: more })}
        </a>
      ) : null}
    </details>
  );
}
