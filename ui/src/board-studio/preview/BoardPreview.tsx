import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import { LaneHead } from '../../lanes/LaneHead.tsx';
import type { LaneBlock } from '../../lanes/LaneList.tsx';
import { LaneList } from '../../lanes/LaneList.tsx';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import type { ReadyDraft } from '../use-board-draft.ts';
import { doesText, reviewsText } from '../words.ts';
import { sampleRowBlock } from './SampleRow.tsx';
import { type SampleItem, sampleItems } from './samples.ts';
import { tableOf } from './table.ts';

// El tablero: the board's list on the lanes with sample items at every step and in every look (an
// agent's lit, waiting when it never connected, yours with its halo) and one in Hecho. Each step's
// head says who does and reviews it, with «¿por qué?» back to its card.

export function BoardPreview({ draft }: { draft: ReadyDraft }) {
  const { def } = draft;
  const offline = draft.problems
    .filter((p) => p.code === 'agent_offline')
    .map((p) => String(p.params.agent));
  const items = sampleItems(def, offline);
  const blocks: LaneBlock[] = [];
  for (const step of def.steps) {
    const here = items.filter((item) => !item.closed && item.step === step.id);
    blocks.push({
      kind: 'sec',
      key: `sec:${step.id}`,
      title: step.name || '—',
      count: here.length,
      gloss: `${doesText(step.doer)}, ${reviewsText(step.reviewer)}`,
      action: (
        <button
          type="button"
          className="sact bsp-why"
          onClick={() => draft.reveal({ kind: 'step', id: step.id })}
        >
          {t('bs.preview.whyShort')}
        </button>
      ),
    });
    for (const item of here) blocks.push(sampleRowBlock(def, item, `s:${step.id}`));
  }
  const done = items.filter((item) => item.closed);
  blocks.push({
    kind: 'sec',
    key: 'sec:done',
    title: t('bs.done'),
    count: done.length,
    gloss: t('bs.preview.board.doneGloss'),
  });
  for (const item of done) blocks.push(sampleRowBlock(def, item, 's:done'));
  if (def.steps.length === 0) return <p className="bsp-emptyx">{t('bs.preview.board.noSteps')}</p>;
  if (def.list.as === 'table') return <SampleTable def={def} items={items} />;
  return (
    <div className="bsp-board">
      <LaneHead />
      <LaneList list="preview" blocks={blocks} />
    </div>
  );
}

// La lista como Tabla: a fixed node column, the title and id, the step, the board's columns (they
// drop by the table's own width, F15) and Turno; a head per group.
function SampleTable({ def, items }: { def: BoardDefinition; items: SampleItem[] }) {
  const table = tableOf(def, items);
  return (
    <div className="bsp-tbl">
      <div className="tr th">
        <span className="tt">{t('bs.preview.table.item')}</span>
        <span className="c-s">{t('bs.preview.table.step')}</span>
        {table.columns.map((part, k) => (
          <span key={part.id} className={k ? 'c-x c-more' : 'c-x'}>
            {part.name}
          </span>
        ))}
        <span className="c-t">{t('bs.preview.table.turn')}</span>
      </div>
      {table.groups.map((group) => (
        <div key={group.key ?? ''}>
          {group.key !== null ? (
            <div className="tg">
              <h3>{group.head}</h3>
              <span className="rl" />
              <span className="cnt">{group.rows.length}</span>
            </div>
          ) : null}
          {group.rows.map((row) => (
            <div key={row.item.id} className={row.item.closed ? 'tr closed' : 'tr'}>
              <span className="tt">
                <span className="cn">
                  <NodeGlyph look={row.item.look} size={16} />
                </span>
                <span className="tx2">
                  <b>{row.item.title}</b>
                  <small>{row.item.id}</small>
                </span>
              </span>
              <span className="c-s">{row.step}</span>
              {row.cells.map((cell, k) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the columns' order is the key
                <span key={k} className={k ? 'c-x c-more' : 'c-x'}>
                  {cell}
                </span>
              ))}
              <span className={row.you ? 'c-t you' : 'c-t'}>{row.turn}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
