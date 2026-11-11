import type { Connection } from '../../../src/core/blueprint.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/index.ts';
import type { Gate } from './gate.ts';

// What a link does to its target's gate, said before anything else in the link's inspector: it
// holds the target in a state, it is only a pointer, or it waits for nothing, with the fix and what
// the fix will do.

type ConsequenceProps = {
  link: Connection;
  gate: Gate;
  // Undefined while the blueprint cannot be edited here.
  onFix: (() => void) | undefined;
  busy: boolean;
  error: string | undefined;
  // The draft changed the blueprint: the fix works on the saved one.
  saveFirst: boolean;
};

export function Consequence({ link, gate, onFix, busy, error, saveFirst }: ConsequenceProps) {
  if (gate.kind === 'pointer') {
    return <p className="st-gate">{t('studio.blueprint.fedLine')}</p>;
  }
  if (gate.kind === 'waits') {
    return (
      <p className="st-gate">
        <span className="st-bw-i">⧗</span>
        <span>
          {t('studio.blueprint.waitsLine', {
            type: link.to.type,
            state: gate.state,
            other: link.from.type,
            board: link.from.board,
          })}
        </span>
      </p>
    );
  }
  const { fix } = gate;
  return (
    <div className="st-gate warn" role="status">
      <Icon name="warn" />
      <div>
        <p>
          <b>{t('studio.blueprint.gate.nothingTitle')}</b>{' '}
          {t('studio.blueprint.gate.nothing', { type: link.to.type })}
        </p>
        {fix && onFix ? (
          <>
            <button type="button" className="btn sm" disabled={busy || saveFirst} onClick={onFix}>
              {t('studio.blueprint.gate.fix', { state: fix.state })}
            </button>
            <p className="st-gate-n">
              {saveFirst
                ? t('studio.blueprint.gate.saveFirst')
                : fix.copy
                  ? t('studio.blueprint.gate.copyNote', {
                      preset: fix.preset,
                      copy: fix.copy,
                      type: fix.type,
                      state: fix.state,
                      from: link.from.type,
                      board: fix.board,
                    })
                  : t('studio.blueprint.gate.draftNote', { preset: fix.preset, state: fix.state })}
            </p>
          </>
        ) : null}
        {error ? <p className="st-error st-small">{error}</p> : null}
      </div>
    </div>
  );
}

// The header's not on screen tray for the blueprint: each link that waits for nothing, as otea
// validate reports it, with show me.
export function BlueprintTray({
  links,
  onShow,
}: {
  links: readonly string[];
  onShow: (link: string) => void;
}) {
  return (
    <div
      className="st-tray2"
      role="dialog"
      aria-label={t('studio.tray.title', { count: links.length })}
    >
      <div className="st-tray2-h">
        <span>{t('studio.tray.title', { count: links.length })}</span>
        <span>{t('studio.tray.still')}</span>
      </div>
      <ul>
        {links.map((link) => (
          <li key={link} data-level="warning">
            <span className="st-tray2-i" aria-hidden="true">
              <Icon name="warn" />
            </span>
            <div>
              <b>{t('studio.blueprint.gate.nothingRow', { link })}</b>
              <p>{t('studio.blueprint.gate.nothingWhy')}</p>
              <span className="st-tray2-a">
                <button type="button" className="btn sm quiet" onClick={() => onShow(link)}>
                  <Icon name="eye" />
                  {t('studio.tray.show')}
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
