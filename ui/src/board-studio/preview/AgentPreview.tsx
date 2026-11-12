import type { ReactNode } from 'react';
import type { Phase } from '../../../../src/core/board/engine.ts';
import { stepById } from '../../../../src/core/board/model.ts';
import { t, tx } from '../../i18n/i18n.ts';
import type { ReadyDraft } from '../use-board-draft.ts';
import { agentView } from './agent.ts';

// Lo que lee el agente: next's exact answer for a sample item at the step on screen, then the exact
// answer to an empty handoff (the refusal) or to the move (the line after it). The text is the
// one writer's (core/board/next.ts), so it is what an agent meets once the draft is published.

const HEADS = new Set([
  'About this board',
  'Starts with',
  'When you take it',
  'When you review it',
  'Handoff',
  'Before you hand it off',
  'Next',
  'When you finish',
]);

// The text as it is, with the section heads quiet and the ✗ marks in warn.
function marked(text: string): ReactNode[] {
  return text.split('\n').map((line, i) => {
    const key = `${i}:${line}`;
    const end = i < text.split('\n').length - 1 ? '\n' : '';
    if (i === 0)
      return (
        <span key={key} className="k">
          {line}
          {end}
        </span>
      );
    if (HEADS.has(line))
      return (
        <span key={key} className="h">
          {line}
          {end}
        </span>
      );
    const cross = line.indexOf('✗');
    if (cross >= 0)
      return (
        <span key={key}>
          {line.slice(0, cross)}
          <span className="miss">✗</span>
          {line.slice(cross + 1)}
          {end}
        </span>
      );
    return (
      <span key={key}>
        {line}
        {end}
      </span>
    );
  });
}

export function AgentPreview({
  draft,
  stepId,
  phase,
}: {
  draft: ReadyDraft;
  stepId: string | undefined;
  phase: Phase;
}) {
  const view = agentView(draft.def, stepId, phase);
  if (view.kind === 'none') return <p className="bsp-emptyx">{t('bs.preview.agent.noSteps')}</p>;
  const step = stepById(draft.def, view.step);
  const name = step?.name ?? '';
  if (view.kind === 'yours')
    return (
      <>
        <p className="bsp-axl">
          {name} <small>{t('bs.preview.agent.forNobody')}</small>
        </p>
        <p className="bsp-emptyx">{tx('bs.preview.agent.yours', { next: <b>next</b> })}</p>
      </>
    );
  const who = view.who ?? t('bs.preview.agent.anyAgent');
  return (
    <>
      <p className="bsp-axl">
        {name}{' '}
        <small>
          {view.phase === 'review'
            ? t('bs.preview.agent.forReviewer', { who })
            : t('bs.preview.agent.for', { who })}
        </small>
      </p>
      <pre className="bsp-agentx">{marked(view.text)}</pre>
      <p className="bsp-axl">
        {t(view.phase === 'review' ? 'bs.preview.agent.ifApproved' : 'bs.preview.agent.ifEmpty')}{' '}
        <small>{t('bs.preview.agent.exact')}</small>
      </p>
      <pre className={view.after.kind === 'refusal' ? 'bsp-refuse' : 'bsp-agentx'}>
        {`otea ${view.phase === 'review' ? 'approve' : 'handoff'} ${view.id}\n\n${view.after.text}`}
      </pre>
      <p className="bsp-note">{t('bs.preview.agent.english')}</p>
    </>
  );
}
