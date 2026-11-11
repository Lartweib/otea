import { type CSSProperties, useRef } from 'react';
import { t } from '../i18n/i18n.ts';
import { useDismiss } from './dismiss.ts';
import { FIELD_KINDS, type FieldKind } from './types.ts';

export type NewFieldProps = {
  name: string;
  onName: (name: string) => void;
  kind: FieldKind;
  onKind: (kind: FieldKind) => void;
  // The place it lands in, as a word: "Brief", "the form", "the row".
  place: string;
  onSubmit: () => void;
  onCancel: () => void;
  style?: CSSProperties;
};

function Preview({ kind }: { kind: FieldKind }) {
  if (kind === 'short') return <span className="cz-v">{t('customize.sample.short')}</span>;
  if (kind === 'long')
    return (
      <span className="cz-atl">
        <i />
        <i />
        <i />
      </span>
    );
  if (kind === 'choice') return <span className="pill">{t('customize.sample.choice')}</span>;
  return (
    <span className="cz-sv">
      <span className="sev">
        <i className="on" />
        <i className="on" />
        <i className="on" />
        <i />
      </span>
      <span>{t('customize.sample.level')}</span>
    </span>
  );
}

// Any name is allowed, spaces included; it is the field's label as written.
export function NewField(p: NewFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, p.onCancel);
  return (
    <div ref={ref} className="cz-add" tabIndex={-1} style={p.style}>
      <span className="cz-ml">{t('customize.newFieldTitle')}</span>
      <input
        className="cz-in"
        type="text"
        aria-label={t('customize.name')}
        placeholder={t('customize.namePlaceholder')}
        value={p.name}
        onChange={(e) => p.onName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && p.name.trim()) p.onSubmit();
        }}
      />
      <div className="cz-ats" data-i="">
        {FIELD_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`cz-at${p.kind === k ? ' on' : ''}`}
            aria-pressed={p.kind === k}
            onClick={() => p.onKind(k)}
          >
            <b>{t(`customize.kind.${k}`)}</b>
            <span className="cz-atp">
              <Preview kind={k} />
            </span>
          </button>
        ))}
      </div>
      <div className="cz-adda" data-i="">
        <button
          type="button"
          className="btn sm primary"
          disabled={!p.name.trim()}
          onClick={p.onSubmit}
        >
          {t('customize.addTo', { place: p.place })}
        </button>
        <button type="button" className="btn sm quiet" onClick={p.onCancel}>
          {t('customize.cancel')}
        </button>
      </div>
    </div>
  );
}
