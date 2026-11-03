// The options module reads the item's `options` field, written as the architecture playbook asks:
// one `### A · Name` heading per option, a line that sums it up, then `+ ` gains and `- ` costs.
// `(recommended)` after the name marks the agent's pick. Text that holds no such heading is not
// options: the module shows it as Markdown instead.

export type DecisionOption = {
  letter: string;
  name: string;
  summary: string;
  gains: string[];
  costs: string[];
  recommended: boolean;
};

const HEADING = /^#{2,4}\s+([A-Za-z0-9]{1,2})\s*[·.:)\-–—]\s*(.+?)\s*$/;
const RECOMMENDED = /\s*\((?:recommended|recomendada|recomendado)\)\s*$/i;

export function parseOptions(text: string): DecisionOption[] {
  const options: DecisionOption[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    if (heading) {
      const [, letter = '', named = ''] = heading;
      options.push({
        letter: letter.toUpperCase(),
        name: named.replace(RECOMMENDED, ''),
        summary: '',
        gains: [],
        costs: [],
        recommended: RECOMMENDED.test(named),
      });
      continue;
    }
    const option = options.at(-1);
    if (!option || line === '') continue;
    if (/^\+\s+/.test(line)) option.gains.push(line.replace(/^\+\s+/, ''));
    else if (/^[-*]\s+/.test(line)) option.costs.push(line.replace(/^[-*]\s+/, ''));
    else option.summary = option.summary ? `${option.summary} ${line}` : line;
  }
  return options;
}

// One line for a row or a card: how many options, and which the agent recommends.
export function optionsSummary(options: readonly DecisionOption[]): {
  count: number;
  recommended?: string;
} {
  const pick = options.find(({ recommended }) => recommended);
  return { count: options.length, ...(pick ? { recommended: pick.letter } : {}) };
}
