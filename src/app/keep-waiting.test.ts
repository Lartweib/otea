import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../cli/commands.ts';
import { mcpWords } from '../mcp/words.ts';
import { keepWaitingLine, waitAgainLine } from './keep-waiting.ts';

describe('the line next and wait end with', () => {
  it('names the exact wait, with the agent and the collection, to run in the background', () => {
    expect(keepWaitingLine('kiln', 'cli', { idle: true, collection: 'Mis cosas' })).toBe(
      'Wait for one: otea wait --turn agent --unclaimed --collection "Mis cosas" --as kiln in the background if you can, then otea next --collection "Mis cosas" --as kiln. Only a running wait hears the desk: approvals, answers and notes from the person.',
    );
    expect(keepWaitingLine('kiln', 'cli', { idle: false })).toBe(
      'When you finish and otea next --as kiln has nothing: otea wait --turn agent --unclaimed --as kiln in the background if you can.',
    );
    expect(waitAgainLine('kiln', 'cli')).toBe(
      'Then keep going: otea next --as kiln; when it has nothing, otea wait --turn agent --unclaimed --as kiln in the background if you can.',
    );
  });

  // P2S-R2-9: over MCP the background shell comes first; the wait tool, which holds the chat, after.
  it('over MCP names the wait as a background shell line first, and the wait tool after', () => {
    const words = (text: string) => mcpWords(text, COMMANDS);
    const tool =
      'Without a shell, wait { turn: "agent", unclaimed: true } holds your chat until it returns.';
    expect(words(keepWaitingLine('kiln', 'mcp', { idle: true }))).toBe(
      `Wait for one in a background shell, which keeps your chat free: $ otea wait --turn agent --unclaimed --as kiln; then next. ${tool} Only a running wait hears the desk: approvals, answers and notes from the person.`,
    );
    expect(words(keepWaitingLine('kiln', 'mcp', { idle: false }))).toBe(
      `When you finish and next has nothing, wait in a background shell, which keeps your chat free: $ otea wait --turn agent --unclaimed --as kiln. ${tool}`,
    );
    expect(words(waitAgainLine('kiln', 'mcp'))).toBe(
      `Then keep going: next; when it has nothing, wait again in a background shell: $ otea wait --turn agent --unclaimed --as kiln. ${tool}`,
    );
  });
});
