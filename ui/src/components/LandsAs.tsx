import type { CSSProperties, Ref } from 'react';
import { t } from '../i18n/i18n.ts';
import { type Landing, landingNote } from '../intake.ts';
import { NodeMark } from '../kit/index.ts';
import { LANE, laneX } from '../lanes.ts';
import { GRID, ROW } from '../row-grid.ts';
import type { TypeView } from '../types.ts';
import { TypeSlot } from './ItemList.tsx';

type LandsAsProps = {
  type: TypeView;
  landing: Landing;
  id: string;
  title: string;
  // Shown with its type's label, as the list shows types when its collection has several.
  typeLabel: string | undefined;
  strip: Ref<HTMLDivElement>;
};

// The row the new item will be, drawn as you type, on the lane it lands on: the list's own row, its
// node on the lane of the state it starts in (a dashed draft until it can be created).
export function LandsAs({ type, landing, id, title, typeLabel, strip }: LandsAsProps) {
  const height = ROW.top.height;
  const node = height / 2;
  const x = laneX(landing.turn);
  return (
    <div className="lands-as">
      <div className="lands-as-head">
        <span className="t-label">{t('intake.landsAs')}</span>
        <span className="t-cap" aria-live="polite">
          {landingNote(landing, type)}
        </span>
      </div>
      <div className="lands-strip" ref={strip} data-ready={landing.ready || undefined}>
        <div
          className="row"
          data-kind={landing.kind}
          style={{ '--ind': '0px' } as CSSProperties}
          aria-hidden="true"
        >
          <svg
            className="row-node"
            width={GRID.rail}
            height={height}
            viewBox={`0 0 ${GRID.rail} ${height}`}
            aria-hidden="true"
          >
            <path className="ln" d={`M${LANE.agent} 0 V${height}`} />
            <path className="lny" d={`M${LANE.you} 0 V${height}`} />
            <g className="lands-node" style={{ '--x': `${x}px` } as CSSProperties}>
              <NodeMark kind={landing.kind} cx={0} cy={node} r={6} />
            </g>
          </svg>
          <span className="row-fold" />
          <span className="row-type">
            <TypeSlot
              small={false}
              {...(type.icon !== undefined ? { icon: type.icon } : {})}
              {...(typeLabel !== undefined ? { label: typeLabel } : {})}
            />
          </span>
          <span className="row-t1">
            <span className="ttl" data-empty={title === '' || undefined}>
              {title === '' ? t('intake.untitled') : title}
            </span>
          </span>
          <span className="row-t2">
            <span className="row-id">{id}</span>
            <span className="row-state">{landing.state}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
