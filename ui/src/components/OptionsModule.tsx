import { t } from '../i18n/i18n.ts';
import { AgentMark } from '../kit/index.ts';
import { moduleFor } from '../modules/registry.ts';
import { parseOptions } from '../options.ts';
import type { ItemView, LayoutEntry } from '../types.ts';

const FIELD = 'options';

function agentOf(item: ItemView): string | undefined {
  return [...item.events].reverse().find(({ actor }) => actor.kind === 'agent')?.actor.name;
}

// The options a decision weighed, side by side: a letter, a name, a line, then what each gains and
// costs. The agent's pick carries its mark and a ring; once the decision is accepted it carries the
// check and the others step back.
export function OptionsModule({ item, entry }: { item: ItemView; entry: LayoutEntry }) {
  const text = item.fields[FIELD] ?? '';
  if (text.trim() === '') return null;
  const options = parseOptions(text);
  const title = entry.label ?? t('options.title');
  if (options.length === 0) {
    const { Detail } = moduleFor('markdown');
    return (
      <section className="op-module" aria-label={title}>
        <h2 className="t-label">{title}</h2>
        <Detail field={{ name: FIELD, module: 'markdown' }} value={text} />
      </section>
    );
  }
  const accepted = item.closes === 'done';
  const agent = agentOf(item);
  return (
    <section className="op-module" aria-label={title}>
      <div className="op-head">
        <h2 className="t-label">{t('options.count', { count: options.length })}</h2>
        {agent ? <span className="t-cap">{t('options.writtenBy', { agent })}</span> : null}
      </div>
      <ol className="op-list">
        {options.map((option) => {
          const chosen = accepted && option.recommended;
          return (
            <li
              key={option.letter}
              className="op-option"
              data-recommended={option.recommended || undefined}
              data-chosen={chosen || undefined}
              data-out={(accepted && !option.recommended) || undefined}
            >
              <span className="op-letter" aria-hidden="true">
                {option.letter}
              </span>
              <div className="op-body">
                <div className="op-name">
                  <b>{option.name}</b>
                  {chosen ? (
                    <span className="op-tag" data-on="true">
                      {t('options.chosen')}
                    </span>
                  ) : option.recommended && !accepted ? (
                    <span className="op-tag">
                      {agent ? <AgentMark name={agent} decorative /> : null}
                      {t('options.recommends')}
                    </span>
                  ) : null}
                </div>
                {option.summary ? <p className="op-summary">{option.summary}</p> : null}
                {option.gains.length + option.costs.length > 0 ? (
                  <div className="op-trade">
                    <ul className="op-gains" aria-label={t('options.gains')}>
                      {option.gains.map((gain) => (
                        <li key={gain}>{gain}</li>
                      ))}
                    </ul>
                    <ul className="op-costs" aria-label={t('options.costs')}>
                      {option.costs.map((cost) => (
                        <li key={cost}>{cost}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
