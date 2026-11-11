import type { Ref } from 'react';
import { t } from '../i18n/i18n.ts';
import { type Landing, landingLook } from '../intake.ts';
import { AgentMark, SeverityBars } from '../kit/Marks.tsx';
import { LaneHead } from '../lanes/LaneHead.tsx';
import { type LaneBlock, LaneList } from '../lanes/LaneList.tsx';

type LandsAsProps = {
  // The id it will most likely get, the title as typed, the state word it starts in.
  id: string;
  title: string;
  state: string;
  landing: Pick<Landing, 'turn' | 'kind'>;
  // The first one-line field chosen (a category), and the severity level 1-4 when it has one.
  field?: string | undefined;
  level?: number | undefined;
  list?: Ref<HTMLDivElement>;
};

// "llega como" (mock:3909, 3912-3928): the row the new item will be, drawn as you type, on the lane
// of the turn it starts on, as the board lists it: title, id · state · a field, severity, who, now.
export function previewBlock({ id, title, state, landing, field, level }: LandsAsProps): LaneBlock {
  const { lane, look } = landingLook(landing);
  return {
    kind: 'row',
    key: 'pv',
    lane,
    look,
    sec: 'pv',
    inert: true,
    content: (
      <>
        <div className="main-c">
          <div className="t" data-title="">
            <span className={title ? 'tt' : 'tt untitled'}>{title || t('intake.untitled')}</span>
          </div>
          <div className="m">
            <span className="id">{id}</span>
            <span className="mpt">
              <span className="sep">·</span>
              <span className={lane === 'you' ? 'stp you' : 'stp'}>{state}</span>
            </span>
            {field ? (
              <span className="mpt">
                <span className="sep">·</span>
                <span>{field}</span>
              </span>
            ) : null}
          </div>
        </div>
        <span className="sev">{level ? <SeverityBars level={level - 1} /> : null}</span>
        <span className="who">{lane === 'you' ? <AgentMark you decorative /> : null}</span>
        <span className="age">{t('when.now')}</span>
      </>
    ),
  };
}

export function LandsAs(props: LandsAsProps) {
  return (
    <div className="landsas" data-c="" ref={props.list}>
      <div className="ll">{t('intake.landsAs')}</div>
      <LaneHead />
      <LaneList list="preview" blocks={[previewBlock(props)]} drawInOnMount={{ delay: 240 }} />
    </div>
  );
}
