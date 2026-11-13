import { describe, expect, it } from 'vitest';
import { assertProfileValue, modelFamily, profileLine } from './profile.ts';

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
});

describe('assertProfileValue', () => {
  it('takes an exact id as declared', () => {
    expect(() => assertProfileValue('model', 'claude-opus-5-5')).not.toThrow();
    expect(() => assertProfileValue('effort', 'xhigh')).not.toThrow();
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
