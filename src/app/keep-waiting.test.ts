import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../cli/commands.ts';
import { mcpWords } from '../mcp/words.ts';
import { keepWaitingLine, waitAgainLine } from './keep-waiting.ts';

describe('the line next and wait end with', () => {
  it('names the exact wait, with the agent and the collection, to run in the background', () => {
    expect(keepWaitingLine('kiln', 'cli', { idle: true, collection: 'Mis cosas' })).toBe(
      'Wait for one: otea wait --turn agent --unclaimed --collection "Mis cosas" --as kiln in the background if you can, then otea next --collection "Mis cosas" --as kiln.',
    );
    expect(keepWaitingLine('kiln', 'cli', { idle: false })).toBe(
      'When you finish and otea next --as kiln has nothing: otea wait --turn agent --unclaimed --as kiln in the background if you can.',
    );
    expect(waitAgainLine('kiln', 'cli')).toBe(
      'Then keep going: otea next --as kiln; when it has nothing, otea wait --turn agent --unclaimed --as kiln in the background if you can.',
    );
  });

  it('over MCP names the wait tool, and the same wait as a shell line that keeps the chat free', () => {
    const line = mcpWords(keepWaitingLine('kiln', 'mcp', { idle: true }), COMMANDS);
    expect(line).toBe(
      'Wait for one: wait { turn: "agent", unclaimed: true }, then next. To keep your chat free while you wait, run it in a background shell instead: $ otea wait --turn agent --unclaimed --as kiln',
    );
  });
});
