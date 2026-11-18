import { type DecisionOption, optionsOf } from '../../src/core/board/choices.ts';

// The options module reads a decision's options as the engine does (core/board/choices.ts): one
// `### A · Name` heading per option, a line that sums it up, then `+ ` gains and `- ` costs.
// `(recommended)` after the name marks the agent's pick. Text that holds no such heading is not
// options: the module shows it as Markdown instead.

export type { DecisionOption };

export const parseOptions = optionsOf;

// One line for a row or a card: how many options, and which the agent recommends.
export function optionsSummary(options: readonly DecisionOption[]): {
  count: number;
  recommended?: string;
} {
  const pick = options.find(({ recommended }) => recommended);
  return { count: options.length, ...(pick ? { recommended: pick.letter } : {}) };
}
