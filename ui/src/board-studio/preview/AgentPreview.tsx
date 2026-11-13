import type { ReactNode } from 'react';
import type { Phase } from '../../../../src/core/board/engine.ts';
import { stepById } from '../../../../src/core/board/model.ts';
import { listOr, t, tx } from '../../i18n/i18n.ts';
import type { ReadyDraft } from '../use-board-draft.ts';
import { targetName } from '../words.ts';
import { type AgentAnswer, type AgentContext, agentView } from './agent.ts';

// Lo que lee el agente: next's exact answer for a sample item at the step on screen, then the exact
// answer to an empty handoff (the refusal) or to the move (the line after it). The text is the
// one writer's (core/board/next.ts), so it is what an agent meets once the draft is published.

const HEADS = new Set([
  'About this board',
  'Starts with',
  'When you take it',
  'When you review it',
  'Parts',
  'Handoff',
  'Branch',
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

// The situation an answer is for, in the person's words.
function answerLabel(answer: AgentAnswer): string {
  const p = answer.params ?? {};
  switch (answer.label) {
    case 'ifPartsOpen':
      return t('bs.preview.agent.ifPartsOpen', { label: p.label ?? '' });
    case 'ifTakenBack':
      return t('bs.preview.agent.ifTakenBack', { step: p.step ?? '' });
    case 'ifNoParent':
      return t('bs.preview.agent.ifNoParent', { item: p.item ?? '' });
    default:
      return t(`bs.preview.agent.${answer.label}` as 'bs.preview.agent.ifEmpty');
  }
}

export function AgentPreview({
  draft,
  stepId,
  phase,
  context = {},
}: {
  draft: ReadyDraft;
  stepId: string | undefined;
  phase: Phase;
  // A pair's other board: the board this one divides into, or the one it is part of.
  context?: AgentContext;
}) {
  const view = agentView(draft.def, stepId, phase, context);
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
        {view.backs.length ? (
          <p className="bsp-emptyx">
            {t('bs.preview.agent.yoursBack', {
              steps: listOr(view.backs.map((back) => targetName(draft.def, back))),
            })}
          </p>
        ) : null}
      </>
    );
  return (
    <>
      <p className="bsp-axl">
        {name}{' '}
        <small>
          {view.phase === 'review'
            ? t('bs.preview.agent.forReviewer', { who: t('bs.preview.anotherAgent') })
            : t('bs.preview.agent.for', { who: t('bs.preview.agent.anyAgent') })}
        </small>
      </p>
      <pre className="bsp-agentx">{marked(view.text)}</pre>
      {view.answers.map((answer) => (
        <div key={`${answer.label}:${answer.params?.step ?? ''}`}>
          <p className="bsp-axl">
            {answerLabel(answer)} <small>{t('bs.preview.agent.exact')}</small>
          </p>
          {answer.runs.map((run) => (
            <pre key={run.command} className={run.kind === 'refusal' ? 'bsp-refuse' : 'bsp-agentx'}>
              {run.command ? `${run.command}\n\n${run.text}` : run.text}
            </pre>
          ))}
        </div>
      ))}
      <p className="bsp-note">{t('bs.preview.agent.english')}</p>
    </>
  );
}
