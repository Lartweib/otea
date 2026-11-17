import { t } from '../../i18n/i18n.ts';
import { topicsHash } from '../../selection.ts';
import { answeredTopics, lastAnswer } from '../../topics.ts';
import { useTopics } from './use-topics.ts';

// Te toca's folded group of side topics an agent answered: your turn, but never work, so they sit
// below the lanes, folded, one line each; a line opens the topic.
export function AnsweredTopics() {
  const view = useTopics();
  const answered = answeredTopics(view?.topics ?? []);
  if (answered.length === 0) return null;
  return (
    <details className="tp-toca">
      <summary>
        {t('topics.toca.group')} <span className="n">({answered.length})</span>
      </summary>
      <p className="tp-toca-hint">{t('topics.toca.hint')}</p>
      <ul>
        {answered.map((topic) => (
          <li key={topic.id}>
            <a className="tp-row" href={topicsHash(topic.id)}>
              <span className="tp-id">{topic.id}</span>
              <span className="tp-title">{topic.title}</span>
              {lastAnswer(topic) ? <span className="tp-sum">{lastAnswer(topic)?.text}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
