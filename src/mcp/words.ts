import type { Command } from '../cli/command.ts';
import { AGENT_COMMANDS, toolName } from './server.ts';

// A token of a command line: a quoted value, or a run up to a space or the punctuation that ends a
// sentence or a parenthesis.
const TOKEN = /^(?:"[^"]*"|[^\s,;)`]+?)(?=[\s,;)`]|[.:](?:\s|$)|$)/;

// The arguments that name an item, and what can stand for one in a text.
const ITEM_ARGS = new Set(['id', 'ids...']);
const ITEM_VALUE = /^(?:"[^"]*"|<[^>]+>|[A-Z][A-Z0-9]*-\d+)$/;

const quoted = (value: string) =>
  value.startsWith('"') ? value : JSON.stringify(value.replace(/\.$/, ''));

// One command line at `text[start]` (just after "otea "), as the tool call it is: its arguments in
// order, then its options, a flag as true. Undefined when it names no command the server serves.
function call(
  text: string,
  start: number,
  commands: readonly Command[],
): { said: string; end: number } | undefined {
  const name = [...AGENT_COMMANDS]
    .sort((a, b) => b.length - a.length)
    .find(
      (candidate) =>
        text.startsWith(candidate, start) &&
        /^(\s|$|[,.;)`])/.test(text.slice(start + candidate.length)),
    );
  const command = name && commands.find((candidate) => candidate.name === name);
  if (!name || !command) return undefined;
  let at = start + name.length;
  const args = command.args.map((arg) => arg.replace(/\?$/, ''));
  const pairs: string[] = [];
  for (;;) {
    const rest = text.slice(at);
    const space = rest.match(/^ +/)?.[0] ?? '';
    const token = rest.slice(space.length).match(TOKEN)?.[0];
    if (!space || !token || token === '/') break;
    if (token.startsWith('--')) {
      const option = token.slice(2);
      const spec = command.options[option];
      if (!spec) break;
      at += space.length + token.length;
      if (spec.flag) {
        pairs.push(`${option}: true`);
        continue;
      }
      const after = text.slice(at);
      const gap = after.match(/^ +/)?.[0] ?? '';
      const value = after.slice(gap.length).match(TOKEN)?.[0];
      if (!gap || !value || value.startsWith('--')) {
        pairs.push(option);
        continue;
      }
      at += gap.length + value.length;
      pairs.push(`${option}: ${quoted(value)}`);
      continue;
    }
    const arg = args[0];
    if (arg === undefined) break;
    // An item is named by its id, quoted or a placeholder: a word after the command is prose
    // ("pregunta con otea ask antes de seguir").
    if (ITEM_ARGS.has(arg) && !ITEM_VALUE.test(token)) break;
    args.shift();
    at += space.length + token.length;
    pairs.push(`${arg}: ${quoted(token)}`);
  }
  const tool = toolName(name);
  return { said: pairs.length > 0 ? `${tool} { ${pairs.join(', ')} }` : tool, end: at };
}

// What Otea tells an agent, in the words of the MCP tools it calls: `otea wait --turn agent`
// reads `wait { turn: "agent" }`, an option on its own (`--reason`) reads `{ reason }`. A command
// the server does not serve is left as the person would run it.
export function mcpWords(text: string, commands: readonly Command[]): string {
  let out = '';
  let at = 0;
  while (at < text.length) {
    if (text.startsWith('otea ', at) && (at === 0 || /[\s(`"']/.test(text[at - 1] ?? ''))) {
      const told = call(text, at + 'otea '.length, commands);
      if (told) {
        out += told.said;
        at = told.end;
        continue;
      }
      // A command line the server does not serve, kept whole up to where it ends.
      const line = text.slice(at).match(/^otea [^,;)`]*?(?=[,;)`]|[.:](?:\s|$)|$)/)?.[0] ?? 'otea ';
      out += line;
      at += line.length;
      continue;
    }
    const option = text.slice(at).match(/^--([a-z][a-z0-9-]*)(?: ("[^"]*"))?/);
    if (option && (at === 0 || /[\s(`"']/.test(text[at - 1] ?? ''))) {
      out += option[2] === undefined ? `{ ${option[1]} }` : `{ ${option[1]}: ${option[2]} }`;
      at += option[0].length;
      continue;
    }
    out += text[at];
    at += 1;
  }
  return out;
}
