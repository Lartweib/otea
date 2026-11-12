import { t } from '../../i18n/i18n.ts';
import { LaneHead } from '../../lanes/LaneHead.tsx';
import type { LaneBlock } from '../../lanes/LaneList.tsx';
import { LaneList } from '../../lanes/LaneList.tsx';
import type { ReadyDraft } from '../use-board-draft.ts';
import { doesText, reviewsText } from '../words.ts';
import { sampleRowBlock } from './SampleRow.tsx';
import { sampleItems } from './samples.ts';

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
  return (
    <div className="bsp-board">
      <LaneHead />
      <LaneList list="preview" blocks={blocks} />
    </div>
  );
}
