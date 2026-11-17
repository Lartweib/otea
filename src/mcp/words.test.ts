import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../cli/commands.ts';
import { mcpWords } from './words.ts';

const words = (text: string) => mcpWords(text, COMMANDS);

// Over MCP an agent calls tools, not commands: what Otea tells it names the tool and its arguments.
describe('mcpWords', () => {
  it('names a command line as the tool call it is', () => {
    expect(words('Wait for one: otea wait --turn agent --unclaimed, then otea next.')).toBe(
      'Wait for one: wait { turn: "agent", unclaimed: true }, then next.',
    );
    expect(words('Claim it first: otea claim CRI-1 (otea next --claim takes it).')).toBe(
      'Claim it first: claim { id: "CRI-1" } (next { claim: true } takes it).',
    );
    expect(words('  otea handoff CRI-1 --way "Triar" --reason "why"')).toBe(
      '  handoff { id: "CRI-1", way: "Triar", reason: "why" }',
    );
    expect(words('otea board draft --new "Ideas" --why "<why>"')).toBe(
      'board_draft { new: "Ideas", why: "<why>" }',
    );
  });

  it('names an option on its own as the argument', () => {
    expect(words('Not taken back: say why with --reason.')).toBe(
      'Not taken back: say why with { reason }.',
    );
    expect(words('Call handoff again with --note "<la prueba>".')).toBe(
      'Call handoff again with { note: "<la prueba>" }.',
    );
    expect(words('Attach or fill them with otea attach BUG-1 / otea update BUG-1, then')).toBe(
      'Attach or fill them with attach { id: "BUG-1" } / update { id: "BUG-1" }, then',
    );
    expect(words('--timeout must be at most 15m over MCP')).toBe(
      '{ timeout } must be at most 15m over MCP',
    );
  });

  it('never reads the prose after a command as its item', () => {
    expect(words('Si dudas, pregunta con otea ask antes de seguir.')).toBe(
      'Si dudas, pregunta con ask antes de seguir.',
    );
    expect(words('Read it: otea show <id>, then otea board tasks.')).toBe(
      'Read it: show { id: "<id>" }, then board { name: "tasks" }.',
    );
  });

  it('leaves a command the server does not serve as the person would run it', () => {
    expect(words('Ask the person to run otea init --agents-md.')).toBe(
      'Ask the person to run otea init --agents-md.',
    );
  });
});
