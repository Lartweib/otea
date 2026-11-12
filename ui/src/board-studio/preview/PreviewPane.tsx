import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import type { Phase } from '../../../../src/core/board/engine.ts';
import type { Selection } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import { Seg } from '../../kit/Seg.tsx';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import type { ReadyDraft } from '../use-board-draft.ts';
import { AgentPreview } from './AgentPreview.tsx';
import { BoardPreview } from './BoardPreview.tsx';
import { PracticeDialog } from './dialogs.tsx';
import { ItemPreview } from './ItemPreview.tsx';
import { DonePreview, FormPreview } from './PagePreviews.tsx';

// The editor's preview pane: Lo que ves (the item page at the selected step, with Acomodar), Lo
// que lee el agente (next's exact text) and El tablero (the list with sample items). It reads the
// draft and changes it only through Acomodar (draft.mutate); a click on any box reveals its card.
export type PreviewPaneProps = { draft: ReadyDraft };

type Tab = 'see' | 'agent' | 'board';

// The step a selection is about: the step, or the step of a part; none for the other stops.
function stepOf(draft: ReadyDraft, selection: Selection): string | undefined {
  if (selection.kind === 'step') return selection.id;
  if (selection.kind === 'part' && selection.step) return selection.step;
  if (selection.kind === 'anytime') return draft.def.steps[0]?.id;
  return undefined;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="bsp-play">
      <path
        d="M5 3.5v9l7-4.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PreviewPane({ draft }: PreviewPaneProps) {
  const [tab, setTab] = useState<Tab>('see');
  const [phase, setPhase] = useState<Phase>('review');
  const [arranging, setArranging] = useState(false);
  const [practice, setPractice] = useState(false);
  const { def, selection } = draft;
  const stepId = stepOf(draft, selection);
  const step = stepId ? def.steps.find(({ id }) => id === stepId) : undefined;
  const page = tab === 'see' ? (selection.kind === 'about' ? 'board' : selection.kind) : tab;
  const canArrange =
    tab === 'see' && step !== undefined && page !== 'form' && page !== 'done' && page !== 'board';
  const showArrange = canArrange && arranging;

  // The body cross-fades when what it shows changes (a tab, a stop).
  const body = useRef<HTMLDivElement>(null);
  const shown = `${tab}:${page}:${stepId ?? ''}`;
  const was = useRef(shown);
  useLayoutEffect(() => {
    if (was.current === shown) return;
    was.current = shown;
    if (reduced()) return;
    body.current?.animate(
      [
        { opacity: 0, filter: 'blur(1px)', transform: 'translateY(4px)' },
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
      ],
      { duration: 360, easing: C.glide },
    );
  }, [shown]);

  let content: ReactNode;
  if (tab === 'agent') content = <AgentPreview draft={draft} stepId={stepId} phase={phase} />;
  else if (page === 'board') content = <BoardPreview draft={draft} />;
  else if (page === 'form') content = <FormPreview draft={draft} />;
  else if (page === 'done') content = <DonePreview draft={draft} />;
  else if (step)
    content = (
      <ItemPreview
        draft={draft}
        stepId={step.id}
        phase={phase}
        onPhase={setPhase}
        arranging={showArrange}
      />
    );
  else content = <p className="bsp-emptyx">{t('bs.preview.noSteps')}</p>;

  let foot: ReactNode = null;
  if (page === 'board' && tab !== 'agent')
    foot = (
      <div className="bsp-foot">
        <span>{t('bs.preview.board.foot', { board: def.name })}</span>
        <span className="sp" />
        <button type="button" className="btn quiet sm" onClick={() => setPractice(true)}>
          <PlayIcon />
          {t('bs.preview.practice')}
        </button>
      </div>
    );
  else if (canArrange)
    foot = (
      <div className="bsp-foot">
        {showArrange ? t('bs.preview.arrange.foot') : t('bs.preview.see.foot')}
      </div>
    );

  return (
    <section className="bsp" aria-label={t('bs.preview.label')}>
      <i className="cline" />
      <div className="bsp-head">
        <Seg<Tab>
          value={tab}
          label={t('bs.preview.label')}
          onChange={(value) => setTab(value)}
          options={[
            { value: 'see', label: t('bs.preview.see') },
            { value: 'agent', label: t('bs.preview.agent') },
            { value: 'board', label: t('bs.preview.board') },
          ]}
        />
        <span className="sp" />
        {canArrange ? (
          <button
            type="button"
            className={showArrange ? 'btn quiet sm on' : 'btn quiet sm'}
            aria-pressed={showArrange}
            onClick={() => setArranging(!arranging)}
          >
            {showArrange ? t('bs.preview.arrange.done') : t('bs.preview.arrange')}
          </button>
        ) : null}
      </div>
      <div className="bsp-body" ref={body}>
        {content}
      </div>
      {foot}
      <PracticeDialog draft={draft} open={practice} onClose={() => setPractice(false)} />
    </section>
  );
}
