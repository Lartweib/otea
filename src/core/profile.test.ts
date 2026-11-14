import { describe, expect, it } from 'vitest';
import { assertProfileValue, isUnknown, modelFamily, profileLine, UNKNOWN } from './profile.ts';

describe('modelFamily', () => {
  it.each([
    ['claude-opus-5-5', 'opus'],
    ['claude-sonnet-4-5-20250929', 'sonnet'],
    ['claude-haiku-4-5', 'haiku'],
    ['Claude-Opus-4-1', 'opus'],
    ['gpt-5', 'gpt-5'],
    ['gpt-5.1-codex', 'gpt-5'],
    ['gpt-4o-mini', 'gpt-4'],
    ['o3', 'o3'],
    ['o4-mini', 'o4'],
    ['gemini-2.5-pro', 'gemini-pro'],
    ['gemini-3-flash-preview', 'gemini-flash'],
  ])('groups %s under %s', (model, family) => {
    expect(modelFamily(model)).toBe(family);
  });

  it('keeps an id it does not know as its own family', () => {
    expect(modelFamily('qwen3-coder')).toBe('qwen3-coder');
  });

  it('keeps a model the agent could not read as its own bucket, never a family', () => {
    expect(modelFamily(UNKNOWN)).toBe('unknown');
    expect(modelFamily('Unknown')).toBe('unknown');
  });
});

describe('assertProfileValue', () => {
  it('takes an exact id as declared', () => {
    expect(() => assertProfileValue('model', 'claude-opus-5-5')).not.toThrow();
    expect(() => assertProfileValue('effort', 'xhigh')).not.toThrow();
  });

  it('gives back the value as it is kept', () => {
    expect(assertProfileValue('model', 'claude-opus-5-5')).toBe('claude-opus-5-5');
  });

  it.each(['model', 'effort'] as const)('takes unknown for a %s the agent cannot read', (name) => {
    expect(assertProfileValue(name, 'unknown')).toBe(UNKNOWN);
    expect(assertProfileValue(name, 'Unknown')).toBe(UNKNOWN);
    expect(assertProfileValue(name, 'UNKNOWN')).toBe(UNKNOWN);
  });

  it('refuses unknown for the harness, which the agent always knows', () => {
    expect(() => assertProfileValue('harness', 'unknown')).toThrow(/--harness/);
    expect(() => assertProfileValue('harness', 'claude-code')).not.toThrow();
  });

  it('tells an agent to declare unknown rather than guess', () => {
    expect(() => assertProfileValue('effort', 'two words')).toThrow(/unknown.*never guess/);
  });

  it.each(['', ' ', 'two words', 'x'.repeat(101)])('refuses %j', (value) => {
    expect(() => assertProfileValue('model', value)).toThrow(/--model/);
  });
});

describe('profileLine', () => {
  it('says the model and the effort', () => {
    expect(profileLine({ harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high' })).toBe(
      'claude-opus-5-5 · high',
    );
  });
});

describe('isUnknown', () => {
  it('tells a value the agent could not read', () => {
    expect(isUnknown('unknown')).toBe(true);
    expect(isUnknown('high')).toBe(false);
  });
});
