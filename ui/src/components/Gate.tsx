import type { GateRow } from '../gates.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/index.ts';

// Never color alone: an allowed action is a ring with a tick, a refused one a lock, each with words.
function Mark({ allowed }: { allowed: boolean }) {
  return <Icon name={allowed ? 'done' : 'lock'} />;
}

// Details › Gate: what `otea check` lets through for this item now, and in which states it would.
export function GateBlock({ rows }: { rows: readonly GateRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="gate-block" aria-labelledby="gate-title">
      <header className="gate-head">
        <h3 className="t-label" id="gate-title">
          {t('gate.title')}
        </h3>
        <code className="t-cap">otea check</code>
      </header>
      <ul className="gate-rows">
        {rows.map(({ action, allowed, states }) => (
          <li key={action} className="gate-row" data-allowed={allowed || undefined}>
            <Mark allowed={allowed} />
            <b>{t(allowed ? 'gate.allowed' : 'gate.blocked', { action })}</b>
            <span className="t-cap">
              {t(allowed ? 'gate.allowedIn' : 'gate.onlyIn', { states: states.join(', ') })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The same verdicts, compact, at the end of a child's row: `✓ push  🔒 merge`.
export function GateCell({ rows }: { rows: readonly GateRow[] }) {
  if (rows.length === 0) return null;
  return (
    <span className="gate-cell">
      {rows.map(({ action, allowed }) => (
        <span
          key={action}
          className="gate-mark"
          data-allowed={allowed || undefined}
          title={t(allowed ? 'gate.allowed' : 'gate.blocked', { action })}
        >
          <Mark allowed={allowed} />
          <span>{action}</span>
          <span className="visually-hidden">
            {t(allowed ? 'gate.allowedShort' : 'gate.blockedShort')}
          </span>
        </span>
      ))}
    </span>
  );
}
