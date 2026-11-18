import type { ItemChoice } from '../../../src/core/board/choices.ts';
import { t } from '../i18n/i18n.ts';
import { AgentMark } from '../kit/index.ts';
import { moduleFor } from '../modules/registry.ts';
import { type DecisionOption, parseOptions } from '../options.ts';
import type { ItemView, LayoutEntry } from '../types.ts';

const FIELD = 'options';

function agentOf(item: ItemView): string | undefined {
  return [...item.events].reverse().find(({ actor }) => actor.kind === 'agent')?.actor.name;
}

// The options a decision weighed, side by side: a letter, a name, a line, then what each gains and
// costs. The agent's pick carries its mark and a ring; once the decision is accepted it carries the
// check and the others step back. On a Studio board you pick one as you approve (`chosen`, the last
// you picked): that one carries the check and your comment, and the others step back.
export function OptionsModule({
  item,
  entry,
  slot,
  field = FIELD,
  sideBySide = false,
  chosen,
}: {
  item: ItemView;
  entry: LayoutEntry;
  slot?: Readonly<Record<string, string>>;
  // The long text to read (a Studio board's field shown as options); `options` by default.
  field?: string;
  // A Studio board's long text shown as options: the options in columns, as the mock draws them.
  sideBySide?: boolean;
  // On a Studio board: the option you picked last, with your comment.
  chosen?: ItemChoice | undefined;
}) {
  const text = item.fields[field] ?? '';
  if (text.trim() === '') return null;
  const options = parseOptions(text);
  const title = entry.label ?? t('options.title');
  if (options.length === 0) {
    const { Detail } = moduleFor('markdown');
    return (
      <section className="op-module" aria-label={title} {...slot}>
        <h2 className="t-label">{title}</h2>
        <Detail field={{ name: field, module: 'markdown' }} value={text} />
      </section>
    );
  }
  const picked = chosen && options.some(({ letter }) => letter === chosen.option) ? chosen : null;
  const accepted = !picked && item.closes === 'done';
  const agent = agentOf(item);
  const isChosen = (option: DecisionOption) =>
    picked ? option.letter === picked.option : accepted && option.recommended;
  const settled = !!picked || accepted;
  return (
    <section className="op-module" aria-label={title} {...slot}>
      <div className="op-head">
        <h2 className="t-label">{t('options.count', { count: options.length })}</h2>
        {agent ? (
          <span className="t-cap">
            {t(sideBySide ? 'options.writtenByPick' : 'options.writtenBy', { agent })}
          </span>
        ) : null}
      </div>
      <ol className={sideBySide ? 'op-list side' : 'op-list'}>
        {options.map((option) => {
          const on = isChosen(option);
          return (
            <li
              key={option.letter}
              className="op-option"
              data-recommended={option.recommended || undefined}
              data-chosen={on || undefined}
              data-out={(settled && !on) || undefined}
            >
              <span className="op-letter" aria-hidden="true">
                {option.letter}
              </span>
              <div className="op-body">
                <div className="op-name">
                  <b>{option.name}</b>
                  {on ? (
                    <span className="op-tag" data-on="true">
                      {t('options.chosen')}
                    </span>
                  ) : option.recommended && !settled ? (
                    <span className="op-tag">
                      {agent ? <AgentMark name={agent} decorative /> : null}
                      {t('options.recommends')}
                    </span>
                  ) : null}
                </div>
                {option.summary ? <p className="op-summary">{option.summary}</p> : null}
                {on && picked?.comment ? (
                  <p className="op-comment">
                    <span className="t-cap">{t('pick.yourComment')}</span> {picked.comment}
                  </p>
                ) : null}
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
