import {
  approve,
  handoff,
  handoffCheck,
  type Missing,
  type Phase,
} from '../../../../src/core/board/engine.ts';
import { type BoardDefinition, isAgent, stepById } from '../../../../src/core/board/model.ts';
import { handedText, nextText, refusalText } from '../../../../src/core/board/next.ts';
import { type SampleFacts, sampleFacts, sampleId } from './samples.ts';

// Lo que lee el agente: `next`'s answer for a sample item at the step and phase on screen, from the
// same writer the server uses (core/board/next.ts), and below it what an empty handoff gets back:
// the exact refusal, or the line after the move.

export type AgentView =
  | { kind: 'none' }
  | { kind: 'yours'; step: string }
  | {
      kind: 'text';
      step: string;
      phase: 'doing' | 'review';
      // The agent it is for; null for any agent.
      who: string | null;
      id: string;
      text: string;
      facts: SampleFacts;
      missing: Missing[];
      after: { kind: 'refusal' | 'handed'; text: string };
    };

// Which phase an agent meets at the step: the doing, unless the review is picked and an agent
// reviews; a step you do reaches an agent only through its agent reviewer.
function agentPhase(
  def: BoardDefinition,
  stepId: string,
  wanted: Phase,
): 'doing' | 'review' | null {
  const step = stepById(def, stepId);
  if (!step) return null;
  if (wanted !== 'doing' && isAgent(step.reviewer)) return 'review';
  if (step.doer !== 'you') return 'doing';
  return isAgent(step.reviewer) ? 'review' : null;
}

export function agentView(
  def: BoardDefinition,
  stepId: string | undefined,
  wanted: Phase,
): AgentView {
  const id = stepId ?? def.steps.find((step) => step.doer !== 'you')?.id ?? def.steps[0]?.id;
  const step = id ? stepById(def, id) : undefined;
  if (!step) return { kind: 'none' };
  const phase = agentPhase(def, step.id, wanted);
  if (!phase) return { kind: 'yours', step: step.id };

  const itemId = sampleId(def);
  const facts = sampleFacts(def, step.id, phase);
  const missing = handoffCheck(def, step.id, facts.engine).missing;
  const reviewer = isAgent(step.reviewer) ? step.reviewer.agent : null;
  const doer = isAgent(step.doer) ? step.doer.agent : null;
  const who = phase === 'review' ? reviewer : doer;
  const position = { step: step.id, phase };
  const text = nextText(def, {
    id: itemId,
    title: facts.title,
    position,
    round: 1,
    fields: facts.fields,
    evidence: facts.evidence,
    missing,
    ...(who ? { me: who } : {}),
  });

  let after: { kind: 'refusal' | 'handed'; text: string };
  if (phase === 'review') {
    const moved = approve(def, position);
    after = { kind: 'handed', text: moved.ok ? handedText(def, itemId, moved.to) : '' };
  } else {
    const moved = handoff(def, position, facts.engine, {
      by: { kind: 'agent', name: who ?? 'agent' },
    });
    after = moved.ok
      ? { kind: 'handed', text: handedText(def, itemId, moved.to) }
      : {
          kind: 'refusal',
          text: refusalText(itemId, moved.code === 'missing' ? moved.missing : []),
        };
  }
  return { kind: 'text', step: step.id, phase, who, id: itemId, text, facts, missing, after };
}
