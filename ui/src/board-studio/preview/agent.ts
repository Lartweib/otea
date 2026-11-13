import {
  approve,
  backWaysOf,
  handoff,
  handoffCheck,
  type Linked,
  type Missing,
  NOTE_REF,
  type Phase,
  WAIT_BLOCKERS,
  WAIT_PARTS,
} from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  guardedBranch,
  SAME,
  stepById,
} from '../../../../src/core/board/model.ts';
import {
  approvalRefusalText,
  createdText,
  dropRefusalText,
  gateText,
  handedText,
  NOT_TAKEN_BACK,
  nextText,
  parentRequiredText,
  parentTypeText,
  refusalText,
  takenBackText,
} from '../../../../src/core/board/next.ts';
import { sampleBlocker, sampleParts } from './practice.ts';
import { boardPrefix, type SampleFacts, sampleFacts, sampleId } from './samples.ts';

// Lo que lee el agente: `next`'s answer for a sample item at the step and phase on screen, from the
// same writer the server uses (core/board/next.ts), and below it the exact answers to what an agent
// may try there: an empty handoff, a handoff while its parts or what blocks it are open, a way back
// without and with a reason, a discard, the protected branch, a creation that skips the first step
// and a part created alone. Agents read English: the texts are the writer's, verbatim.

// One exact answer: what the agent runs and what it gets back. `label` names the situation (the
// dialog words it), `params` fills its holes.
export type AgentAnswer = {
  label:
    | 'ifEmpty'
    | 'ifApproved'
    | 'ifPartsOpen'
    | 'ifReopened'
    | 'ifBlocked'
    | 'ifTakenBack'
    | 'ifDrops'
    | 'ifTriesToDrop'
    | 'ifBranch'
    | 'onCreate'
    | 'ifNoParent'
    | 'ifOtherPart';
  params?: Record<string, string>;
  kind: 'refusal' | 'answer';
  // Several runs in one block: each command, then its answer.
  runs: { command: string; text: string; kind: 'refusal' | 'answer' }[];
};

// The other boards of a pair, as the dialog knows them: the board this one divides into, and the
// board this one is part of (with whether its items always are).
export type AgentContext = {
  child?: BoardDefinition;
  parent?: { def: BoardDefinition; always: boolean };
};

export type AgentView =
  | { kind: 'none' }
  | { kind: 'yours'; step: string; backs: string[] }
  | {
      kind: 'text';
      step: string;
      phase: 'doing' | 'review';
      id: string;
      text: string;
      facts: SampleFacts;
      missing: Missing[];
      after: { kind: 'refusal' | 'handed'; text: string };
      answers: AgentAnswer[];
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
  if (wanted !== 'doing' && step.reviewer === 'any') return 'review';
  if (step.doer !== 'you') return 'doing';
  return step.reviewer === 'any' ? 'review' : null;
}

// The board a split names: the pair's child, or this board for parts of its own kind.
const childOf = (def: BoardDefinition, context: AgentContext): BoardDefinition | undefined =>
  def.split ? (def.split.board === SAME ? def : context.child) : undefined;

const one = (
  label: AgentAnswer['label'],
  command: string,
  text: string,
  kind: 'refusal' | 'answer',
  params?: Record<string, string>,
): AgentAnswer => ({ label, kind, runs: [{ command, text, kind }], ...(params ? { params } : {}) });

export function agentView(
  def: BoardDefinition,
  stepId: string | undefined,
  wanted: Phase,
  context: AgentContext = {},
): AgentView {
  const id = stepId ?? def.steps.find((step) => step.doer !== 'you')?.id ?? def.steps[0]?.id;
  const step = id ? stepById(def, id) : undefined;
  if (!step) return { kind: 'none' };
  const phase = agentPhase(def, step.id, wanted);
  if (!phase) return { kind: 'yours', step: step.id, backs: backWaysOf(def, step.id) };

  const itemId = sampleId(def);
  const facts = sampleFacts(def, step.id, phase);
  const child = childOf(def, context);
  const parts: Linked[] = def.split ? sampleParts(def, child) : [];
  const blockers: Linked[] = step.waits.includes('blockers') ? [sampleBlocker(def)] : [];
  const linked = { ...facts.engine, parts, blockers };
  const missing = handoffCheck(def, step.id, linked).missing;
  const position = { step: step.id, phase };
  const text = nextText(def, {
    id: itemId,
    title: facts.title,
    position,
    round: 1,
    fields: facts.fields,
    evidence: facts.evidence,
    missing,
    ...(def.split ? { parts } : {}),
    ...(blockers.length ? { blockers } : {}),
    ...(child ? { child } : {}),
  });

  const handoffCommand = `otea handoff ${itemId}`;
  const noteFlag =
    step.note.req === 'always'
      ? ` --note "${step.note.hint.trim() || 'what changed in this round'}"`
      : '';
  const answers: AgentAnswer[] = [];
  let after: { kind: 'refusal' | 'handed'; text: string };
  if (phase === 'review') {
    const moved = approve(def, position);
    after = { kind: 'handed', text: moved.ok ? handedText(def, itemId, moved.to) : '' };
    answers.push(one('ifApproved', `otea approve ${itemId}`, after.text, 'answer'));
  } else {
    // The handoff with nothing in it: what the step asks for and the note lead; the waits apart.
    const lacking = missing.filter(({ reason }) => reason !== 'open');
    if (lacking.length > 0) {
      after = { kind: 'refusal', text: refusalText(itemId, lacking) };
      answers.push(one('ifEmpty', handoffCommand, after.text, 'refusal'));
    } else {
      const moved = handoff(def, position, facts.engine, {
        by: { kind: 'agent', name: 'agent' },
      });
      after = moved.ok
        ? { kind: 'handed', text: handedText(def, itemId, moved.to) }
        : {
            kind: 'refusal',
            text: refusalText(itemId, moved.code === 'missing' ? moved.missing : []),
          };
      if (step.waits.length === 0)
        answers.push(
          one(
            'ifEmpty',
            handoffCommand,
            after.text,
            after.kind === 'refusal' ? 'refusal' : 'answer',
          ),
        );
    }
    const partsWait = missing.find(({ ref }) => ref === WAIT_PARTS);
    if (partsWait)
      answers.push(
        one(
          'ifPartsOpen',
          `${handoffCommand}${noteFlag}`,
          refusalText(itemId, [partsWait]),
          'refusal',
          {
            label: child?.name ?? def.name,
          },
        ),
      );
    const reopened = partsWait?.open?.[0];
    if (partsWait && reopened && step.reviewer === 'you')
      answers.push(
        one(
          'ifReopened',
          '',
          approvalRefusalText(itemId, [{ ...partsWait, open: [reopened] }]),
          'refusal',
        ),
      );
    const blockersWait = missing.find(({ ref }) => ref === WAIT_BLOCKERS);
    if (blockersWait)
      answers.push(
        one(
          'ifBlocked',
          `${handoffCommand}${noteFlag}`,
          refusalText(itemId, [blockersWait]),
          'refusal',
        ),
      );
    const back = backWaysOf(def, step.id)[0];
    const backStep = back ? stepById(def, back) : undefined;
    if (backStep)
      answers.push({
        label: 'ifTakenBack',
        params: { step: backStep.name },
        kind: 'refusal',
        runs: [
          {
            command: `${handoffCommand} --way "${backStep.name}"`,
            text: NOT_TAKEN_BACK,
            kind: 'refusal',
          },
          {
            command: `${handoffCommand} --way "${backStep.name}" --reason "it does not reproduce with these steps"`,
            text: takenBackText(def, itemId, backStep.id, 2),
            kind: 'answer',
          },
        ],
      });
    const someDrop = def.steps.some(({ doerMayDrop }) => doerMayDrop);
    if (step.doerMayDrop && step.doer !== 'you' && def.drop.motives.length > 0)
      answers.push(
        one(
          'ifDrops',
          `otea drop ${itemId} --reason "already fixed in another one"`,
          dropRefusalText(def, itemId, 'motive_required'),
          'refusal',
        ),
      );
    else if (!step.doerMayDrop && (def.drop.motives.length > 0 || someDrop))
      answers.push(
        one(
          'ifTriesToDrop',
          `otea drop ${itemId} --reason "…"`,
          dropRefusalText(def, itemId, 'not_droppable'),
          'refusal',
        ),
      );
  }

  // The protected branch: what otea check answers here, while it is reviewed, and before Hecho.
  const guard = guardedBranch(def);
  if (guard) {
    const push = guard.guard.push.includes(step.id);
    const runs: AgentAnswer['runs'] = [];
    const check = (
      action: 'push' | 'merge',
      at: { step: string; phase: Phase },
      when: string,
      round = 1,
    ) => {
      const answer = gateText(def, itemId, at, action, round);
      runs.push({
        command: `git ${action}, ${when}`,
        text: answer,
        kind: /allowed/.test(answer.split(':')[0] ?? '') ? 'answer' : 'refusal',
      });
    };
    const doing = push ? `while ${step.name} is being done` : `in ${step.name}`;
    check('push', { step: step.id, phase: 'doing' }, doing);
    if (push && step.reviewer !== 'none')
      check('push', { step: step.id, phase: 'review' }, 'while it is reviewed');
    check('merge', { step: step.id, phase: 'doing' }, 'before Done', 2);
    answers.push({ label: 'ifBranch', kind: 'answer', runs });
  }

  // A first step that skips an item created with everything it asks for.
  const first = def.steps[0];
  const second = def.steps[1];
  if (first && second && first.id === step.id && first.skipWhenReady && first.reviewer === 'none') {
    const prefix = boardPrefix(def);
    const created = `otea create --collection "${def.name}" --title "…"`;
    const lacking = handoffCheck(def, first.id, { fields: {}, evidence: [] }).missing.filter(
      ({ ref }) => ref !== NOTE_REF,
    );
    answers.push({
      label: 'onCreate',
      kind: 'answer',
      runs: [
        {
          command: `${created} (with everything)`,
          text: createdText(def, `${prefix}-13`, { step: second.id, phase: 'doing' }, []),
          kind: 'answer',
        },
        {
          command: created,
          text: createdText(
            def,
            `${prefix}-14`,
            { step: first.id, phase: 'doing' },
            lacking.slice(0, 2),
          ),
          kind: 'answer',
        },
      ],
    });
  }

  // A board whose items are always part of another's: a part created alone.
  if (context.parent?.always)
    answers.push(
      one(
        'ifNoParent',
        `otea create --collection "${def.name}" --title "…"`,
        parentRequiredText(def, context.parent.def),
        'refusal',
        { item: context.parent.def.item },
      ),
    );
  // A parent whose parts live on another board: something else linked as its part.
  if (def.split && def.split.board !== SAME && def.split.always && child) {
    const other = `${boardPrefix(def) === 'TAR' ? 'BUG' : 'TAR'}-3`;
    answers.push(
      one(
        'ifOtherPart',
        `otea link ${itemId} --child ${other}`,
        parentTypeText(def, child, other, 'another board'),
        'refusal',
      ),
    );
  }

  return {
    kind: 'text',
    step: step.id,
    phase,
    id: itemId,
    text,
    facts,
    missing,
    after,
    answers,
  };
}
