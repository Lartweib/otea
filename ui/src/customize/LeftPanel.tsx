import type { PointerEvent } from 'react';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/index.ts';
import { Grip, Plus } from './glyphs.tsx';

export type HiddenField = { id: string; name: string; typeLabel: string };
export type BlockRow = {
  id: string;
  name: string;
  says: string;
  kind: 'files' | 'link';
  // Where it already is (e.g. "Structure"); a block can be in one place only.
  usedIn?: string;
};

export type LeftPanelProps = {
  hidden: readonly HiddenField[];
  blocks?: readonly BlockRow[];
  // Offer "New box".
  boxes?: boolean;
  // Something is being dragged over the panel: say what letting go does.
  dropToHide?: boolean;
  // Replaces the empty-state sentence (the form and the row say their own).
  emptyText?: string;
  // The id of the row being dragged, dimmed in place.
  grabbing?: string;
  onGrab: (id: string, event: PointerEvent<HTMLElement>) => void;
  // Click or Enter on a row: the keyboard way to put it somewhere.
  onActivate?: (id: string) => void;
  onGrabNew?: (event: PointerEvent<HTMLElement>) => void;
  onNewField: () => void;
  onNewBox?: () => void;
};

export function LeftPanel(props: LeftPanelProps) {
  const { hidden, blocks, boxes, dropToHide, grabbing, onGrab, onActivate } = props;
  return (
    <aside className={`cz-left${dropToHide ? ' hot' : ''}`} data-zone="panel">
      <div className="cz-lnew">
        <button
          type="button"
          className="btn sm"
          onPointerDown={props.onGrabNew}
          onClick={props.onNewField}
        >
          <Plus />
          {t('customize.newField')}
        </button>
        {boxes && props.onNewBox ? (
          <button type="button" className="btn sm" onClick={props.onNewBox}>
            <Plus />
            {t('customize.newBox')}
          </button>
        ) : null}
      </div>
      <div className="cz-lg">
        <h3>{t('customize.notInView')}</h3>
        {dropToHide ? <div className="cz-lhide">{t('customize.dropToHide')}</div> : null}
        {hidden.map((h) => (
          <button
            key={h.id}
            type="button"
            className={`cz-lr${grabbing === h.id ? ' origin' : ''}`}
            aria-label={t('customize.grab', { name: h.name })}
            data-panel-row={h.id}
            onPointerDown={(e) => onGrab(h.id, e)}
            onClick={() => onActivate?.(h.id)}
          >
            <Grip />
            <span className="cz-ln">
              <b>{h.name}</b>
              <span>{h.typeLabel}</span>
            </span>
          </button>
        ))}
        {hidden.length === 0 ? (
          <p className="cz-lempty">{props.emptyText ?? t('customize.emptyHidden')}</p>
        ) : null}
      </div>
      {blocks && blocks.length > 0 ? (
        <div className="cz-lg">
          <h3>{t('customize.filesAndLinks')}</h3>
          {blocks.map((b) => {
            const used = b.usedIn !== undefined;
            return (
              <button
                key={b.id}
                type="button"
                className={`cz-lr block${used ? ' used' : ''}${grabbing === b.id ? ' origin' : ''}`}
                aria-label={t('customize.grab', { name: b.name })}
                aria-disabled={used || undefined}
                data-panel-row={b.id}
                onPointerDown={used ? undefined : (e) => onGrab(b.id, e)}
                onClick={used ? undefined : () => onActivate?.(b.id)}
              >
                {used ? <span className="cz-gsp" /> : <Grip />}
                <span className="cz-li">
                  <Icon name={b.kind === 'files' ? 'attach' : 'link'} />
                </span>
                <span className="cz-ln2">
                  <b>{b.name}</b>
                  {used ? (
                    <em>
                      <Icon name="check" />
                      {t('customize.alreadyIn', { place: b.usedIn as string })}
                    </em>
                  ) : (
                    <span>{b.says}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}
