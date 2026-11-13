import type { ReactNode } from 'react';
import { backWaysOf } from '../../../../src/core/board/engine.ts';
import { partOf, type Selection } from '../../../../src/core/board/model.ts';
import { listOf, t } from '../../i18n/i18n.ts';
import { AgentMark } from '../../kit/Marks.tsx';
import { type LaneBlock, LaneList } from '../../lanes/LaneList.tsx';
import type { PairRole } from '../pair.ts';
import type { ReadyDraft } from '../use-board-draft.ts';
import { reviewsText, targetName } from '../words.ts';
import { cardKey, cardOf, useEditor } from './context.ts';
import { addStep } from './edits.ts';
import { Glyph } from './glyphs.tsx';
import { vrouteRows } from './route-geometry.ts';
import { whoWord } from './who.ts';

// The route under 760 px (mock vrouteHtml): the same two lanes, one row per stop, «Añadir un paso»
// just before Hecho. In a joined pair, `board` and `role` say which of the two it draws.
export function VRoute({ board, role }: { board?: ReadyDraft; role?: PairRole } = {}) {
  const { draft: shown, setOpenRow, pair } = useEditor();
  const draft = board ?? shown;
  const active = !pair || role === undefined || pair.role === role;
  const def = draft.def;
  const selKey = active ? cardKey(cardOf(def, draft.selection)) : '';
  const rows = vrouteRows(def);

  const select = (key: string) => {
    setOpenRow(null);
    draft.endBurst();
    const sel: Selection =
      key === 'form' || key === 'done' ? { kind: key } : { kind: 'step', id: key };
    if (pair && role !== undefined && pair.role !== role) pair.switchTo(role, sel);
    else draft.select(sel);
    window.requestAnimationFrame(() =>
      document.querySelector('.se-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
  };
  const add = () => {
    let id = '';
    draft.mutate((d) => {
      id = addStep(d, d.steps.length, t('bs.editor.newstep'));
    });
    if (id) select(id);
  };

  const blocks: LaneBlock[] = [];
  for (const row of rows) {
    if (row.key === 'done')
      blocks.push({
        kind: 'other',
        key: 'add',
        className: 'se-vadd',
        content: (
          <button type="button" className="se-addbtn" onClick={add}>
            <Glyph name="plus" />
            {t('bs.editor.vroute.add')}
          </button>
        ),
      });
    let title: string;
    let meta: ReactNode;
    if (row.key === 'form') {
      title = t('bs.editor.route.create', { item: def.item });
      meta = (
        <span>
          {listOf(
            [def.title, ...def.form.map((f) => partOf(def, f.ref)?.name ?? '')].filter(Boolean),
          )}
        </span>
      );
    } else if (row.key === 'done') {
      title = t('bs.done');
      meta = <span>{t('bs.editor.vroute.done')}</span>;
    } else {
      const step = def.steps.find((s) => s.id === row.key);
      if (!step) continue;
      title = step.name.trim() || t('bs.editor.route.unnamed');
      const doer = step.doer;
      meta = (
        <>
          {doer === 'you' ? <AgentMark you decorative /> : <span className="mk any">ag</span>}
          <span>{whoWord(doer)}</span>
          <span className="sep">·</span>
          <span className={step.reviewer === 'you' ? 'stp you' : undefined}>
            {reviewsText(step.reviewer)}
          </span>
          {step.waits.length ? (
            <>
              <span className="sep">·</span>
              <span>{t('bs.editor.vroute.waits')}</span>
            </>
          ) : null}
          {backWaysOf(def, step.id).length ? (
            <>
              <span className="sep">·</span>
              <span>↩ {listOf(backWaysOf(def, step.id).map((b) => targetName(def, b)))}</span>
            </>
          ) : null}
        </>
      );
    }
    blocks.push({
      kind: 'row',
      key: row.key,
      lane: row.lane,
      look: row.look,
      sec: 'route',
      selected: row.key === selKey,
      content: (
        <div style={{ minWidth: 0 }}>
          <div className="t">{title}</div>
          <div className="m">{meta}</div>
        </div>
      ),
    });
  }

  if (board) return <LaneList list="preview" blocks={blocks} onRow={select} />;
  return (
    <div className="se-vroute">
      <LaneList list="preview" blocks={blocks} onRow={select} />
    </div>
  );
}
