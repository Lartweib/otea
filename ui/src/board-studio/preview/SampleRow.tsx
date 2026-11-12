import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { partOf, stepById, usedRefs } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import { AgentMark } from '../../kit/Marks.tsx';
import type { Lane } from '../../lanes/geometry.ts';
import type { LaneBlock } from '../../lanes/LaneList.tsx';
import { type SampleItem, sampleValue } from './samples.ts';

// A sample item as a list row on the lanes, in the board list's grammar (views/board/rows.tsx): the
// title, the id and whose turn it is, the round, the board's row columns and who has it.

export const laneOfSample = (item: SampleItem): Lane =>
  item.closed ? 'none' : item.look === 'yours' ? 'you' : 'ag';

function turnText(item: SampleItem): string {
  if (item.closed && item.look === 'dropped')
    return item.motive
      ? t('bs.preview.row.droppedAs', { motive: item.motive })
      : t('bs.preview.row.dropped');
  if (item.closed) return t('bs.done');
  if (item.look === 'yours')
    return t(item.phase === 'doing' ? 'bs.preview.row.yourStep' : 'bs.preview.row.yourReview');
  if (item.look === 'waiting') return t('bs.preview.row.waiting', { agent: item.agent ?? '' });
  if (item.phase !== 'doing')
    return t('bs.preview.row.reviewing', { agent: item.agent ?? t('bs.preview.anAgent') });
  return item.agent
    ? t('bs.preview.row.doing', { agent: item.agent })
    : t('bs.preview.row.doingAny');
}

export function sampleRowBlock(def: BoardDefinition, item: SampleItem, sec: string): LaneBlock {
  const lane = laneOfSample(item);
  const used = usedRefs(def);
  const columns = def.row
    .filter((ref) => used.has(ref))
    .slice(0, 2)
    .map((ref) => partOf(def, ref))
    .filter((part) => part !== undefined);
  const step = item.step ? stepById(def, item.step) : undefined;
  return {
    kind: 'row',
    key: item.id,
    lane,
    look: item.look,
    sec,
    inert: true,
    content: (
      <>
        <div className="main-c">
          <div className="t" data-leaf="">
            <span className="tt">{item.title}</span>
          </div>
          <div className="m" data-leaf="">
            <span className="id">{item.id}</span>
            <span className="mpt">
              <span className="sep">·</span>
              <span className={lane === 'you' ? 'stp you' : 'stp'} title={step?.name}>
                {turnText(item)}
              </span>
            </span>
            {item.round > 1 ? (
              <span className="mpt">
                <span className="sep">·</span>
                <span className="round">{t('bs.preview.row.round', { n: item.round })}</span>
              </span>
            ) : null}
          </div>
        </div>
        <span className="bsp-cols" data-leaf="">
          {columns.map((part) => (
            <span key={part.id} title={part.name}>
              {sampleValue(part, item.title.length)}
            </span>
          ))}
        </span>
        <span className="who" data-leaf="">
          {item.closed ? null : item.look === 'yours' ? (
            <AgentMark you />
          ) : (
            <AgentMark name={item.agent} />
          )}
        </span>
      </>
    ),
  };
}
