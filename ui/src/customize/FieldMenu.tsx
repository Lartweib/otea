import { type CSSProperties, useId, useRef, useState } from 'react';
import { t } from '../i18n/i18n.ts';
import { useDismiss } from './dismiss.ts';
import { Cross, Down, Tick, Up } from './glyphs.tsx';
import { addOption } from './options.ts';
import { FIELD_KINDS, type FieldKind, NEEDS, type Need } from './types.ts';

export type ZoneChoice = { id: string; label: string; title?: string };

export type FieldMenuProps = {
  // A field has a type, options and a need; a block (files, links) only a name and a place.
  variant?: 'field' | 'block';
  name: string;
  onName: (name: string) => void;
  onClose: () => void;
  style?: CSSProperties;
  // Block: what it shows.
  says?: string;
  kind?: FieldKind;
  onKind?: (kind: FieldKind) => void;
  // True when the new type may not fit values already saved.
  typeMayNotFit?: boolean;
  options?: readonly string[];
  onAddOption?: (label: string) => void;
  onRemoveOption?: (label: string) => void;
  need?: Need;
  onNeed?: (need: Need) => void;
  inForm?: boolean;
  inRow?: boolean;
  onToggleForm?: () => void;
  onToggleRow?: () => void;
  zones?: readonly ZoneChoice[];
  zone?: string;
  onZone?: (id: string) => void;
  onUp: () => void;
  onDown: () => void;
  upDisabled?: boolean;
  downDisabled?: boolean;
  onHide: () => void;
  hideLabel?: string;
  canDelete?: boolean;
  // How many items hold a value in this field.
  usedBy?: number;
  confirmingDelete?: boolean;
  onAskDelete?: () => void;
  onKeepField?: () => void;
  onDelete?: () => void;
};

export function FieldMenu(p: FieldMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const id = useId();
  useDismiss(ref, p.onClose);
  const field = (p.variant ?? 'field') === 'field';
  const used = p.usedBy ?? 0;
  const addOpt = () => {
    const label = draft.trim();
    if (!label) return;
    if (addOption(p.options ?? [], label).length > (p.options ?? []).length) p.onAddOption?.(label);
    setDraft('');
  };

  return (
    <div ref={ref} className="cz-menu" tabIndex={-1} style={p.style}>
      <div className="cz-mh">
        <input
          className="cz-in"
          type="text"
          aria-label={t('customize.name')}
          value={p.name}
          readOnly={!field}
          onChange={(e) => p.onName(e.target.value)}
        />
        <button
          type="button"
          className="btn sm quiet cz-mx"
          aria-label={t('customize.close')}
          onClick={p.onClose}
        >
          <Cross />
        </button>
      </div>
      {!field && p.says ? <p className="cz-mp">{p.says}</p> : null}
      {field ? (
        <>
          <div className="cz-mq">
            <span className="cz-ml">{t('customize.type')}</span>
            <div className="cz-sg wrap">
              {FIELD_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={p.kind === k ? 'on' : ''}
                  aria-pressed={p.kind === k}
                  onClick={() => p.onKind?.(k)}
                >
                  {t(`customize.kind.${k}`)}
                </button>
              ))}
            </div>
            {p.typeMayNotFit && p.kind ? (
              <p className="cz-mp cz-warn" role="status">
                {t('customize.typeWarning', { kind: t(`customize.kind.${p.kind}`) })}
              </p>
            ) : null}
          </div>
          {p.kind === 'choice' ? (
            <div className="cz-mq">
              <span className="cz-ml">{t('customize.options')}</span>
              <ul className="cz-opts">
                {(p.options ?? []).map((o) => (
                  <li key={o}>
                    <button
                      type="button"
                      className="cz-opt"
                      aria-label={t('customize.removeOption', { label: o })}
                      onClick={() => p.onRemoveOption?.(o)}
                    >
                      {o} ×
                    </button>
                  </li>
                ))}
              </ul>
              <input
                className="cz-in cz-optin"
                type="text"
                placeholder={t('customize.addOption')}
                aria-label={t('customize.addOption')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addOpt();
                  }
                }}
              />
            </div>
          ) : null}
          <div className="cz-mq">
            <span className="cz-ml">{t('customize.needed')}</span>
            <div className="cz-sg wrap">
              {NEEDS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={p.need === n ? 'on' : ''}
                  aria-pressed={p.need === n}
                  onClick={() => p.onNeed?.(n)}
                >
                  {t(`customize.need.${n}`)}
                </button>
              ))}
            </div>
            {p.need ? <p className="cz-mp">{t(`customize.need.${p.need}.says`)}</p> : null}
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: a labelled row of checkboxes */}{' '}
          <div className="cz-mq" role="group" aria-labelledby={`${id}-also`}>
            <span className="cz-ml" id={`${id}-also`}>
              {t('customize.alsoIn')}
            </span>
            <div className="cz-chks">
              <Check checked={!!p.inForm} onToggle={p.onToggleForm} label={t('customize.inForm')} />
              <Check checked={!!p.inRow} onToggle={p.onToggleRow} label={t('customize.inRow')} />
            </div>
          </div>
        </>
      ) : null}
      <div className="cz-mq">
        {p.zones && p.zones.length > 0 ? (
          <>
            <span className="cz-ml">{t('customize.moveTo')}</span>
            <div className="cz-sg wrap">
              {p.zones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  className={p.zone === z.id ? 'on' : ''}
                  title={z.title}
                  aria-pressed={p.zone === z.id}
                  onClick={() => p.onZone?.(z.id)}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <div className="cz-mud">
          <button type="button" className="btn sm quiet" disabled={p.upDisabled} onClick={p.onUp}>
            <Up />
            {t('customize.up')}
          </button>
          <button
            type="button"
            className="btn sm quiet"
            disabled={p.downDisabled}
            onClick={p.onDown}
          >
            <Down />
            {t('customize.down')}
          </button>
        </div>
      </div>
      <div className="cz-mfoot">
        {p.confirmingDelete ? (
          <div className="cz-mdel" role="alertdialog" aria-label={t('customize.deleteTitle')}>
            <b>{t('customize.deleteTitle')}</b>
            <span>
              {used > 0 ? t('customize.deleteKeeps', { count: used }) : t('customize.deleteNone')}
            </span>
            <div className="cz-mdela">
              <button type="button" className="btn sm" onClick={p.onDelete}>
                {t('customize.deleteField')}
              </button>
              <button type="button" className="btn sm quiet" onClick={p.onKeepField}>
                {t('customize.keepIt')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button type="button" className="btn sm quiet" onClick={p.onHide}>
              {p.hideLabel ?? t('customize.hide')}
            </button>
            {p.canDelete ? (
              <div className="cz-mdl">
                <button type="button" className="btn sm quiet" onClick={p.onAskDelete}>
                  {t('customize.deleteField')}
                </button>
                <span className="cz-muse">{t('customize.usedBy', { count: used })}</span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Check(props: { checked: boolean; onToggle?: (() => void) | undefined; label: string }) {
  return (
    <label className="cz-chk">
      <input type="checkbox" checked={props.checked} onChange={props.onToggle} />
      <i>
        <Tick />
      </i>
      {props.label}
    </label>
  );
}
