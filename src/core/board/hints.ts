import { startsWith } from './engine.ts';
import { mentionedRefs } from './mentions.ts';
import { type BoardDefinition, isAgent, isEvidence, partOf, type Step } from './model.ts';

// Soft hints on what an agent reads on a step, for Studio's card and `otea validate`: a step an
// agent works with nothing to read (no instructions, and no words of the board's own, which every
// agent reads), and instructions that ask for something the step's handoff does not require (a
// part it never asks for, or something to attach when it requires no evidence). They never block
// Publicar: the board works, the agent just may not do what you meant.

export type HintCode =
  | 'instructions_missing'
  | 'instructions_ask_part'
  | 'instructions_ask_evidence';

export type Hint = {
  code: HintCode;
  // The step's id.
  step: string;
  params: { step: string; part?: string };
};

// Words that ask for something to be attached, in English and Spanish.
const ATTACH = /\b(adjunt|attach|evidenc|screenshot|captura)/i;

// The instructions the step's agents read: the doer's when an agent does it, the reviewer's when an
// agent reviews it.
function readBy(step: Step): { doer: string[]; all: string[] } {
  const doer = step.doer === 'you' ? [] : [step.instructions.take, step.instructions.before];
  const review = isAgent(step.reviewer) ? [step.instructions.review] : [];
  return { doer, all: [...doer, ...review] };
}

export function instructionHints(def: BoardDefinition): Hint[] {
  const out: Hint[] = [];
  for (const step of def.steps) {
    const { doer, all } = readBy(step);
    if (all.length === 0) continue;
    const params = { step: step.name.trim() };
    if (def.about.trim() === '' && all.every((text) => text.trim() === '')) {
      out.push({ code: 'instructions_missing', step: step.id, params });
      continue;
    }
    const required = new Set(step.hand.filter(({ req }) => req !== 'no').map(({ ref }) => ref));
    const carried = new Set([...startsWith(def, step.id).map(({ ref }) => ref), ...def.anytime]);
    const asked = new Set<string>();
    for (const ref of doer.flatMap(mentionedRefs)) {
      const part = partOf(def, ref);
      if (!part || required.has(ref) || carried.has(ref) || asked.has(ref)) continue;
      asked.add(ref);
      out.push({
        code: 'instructions_ask_part',
        step: step.id,
        params: { ...params, part: part.name.trim() },
      });
    }
    const evidence = [...required].some((ref) => {
      const part = partOf(def, ref);
      return part !== undefined && isEvidence(part);
    });
    if (!evidence && doer.some((text) => ATTACH.test(text)))
      out.push({ code: 'instructions_ask_evidence', step: step.id, params });
  }
  return out;
}
