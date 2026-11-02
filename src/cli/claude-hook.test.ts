import { describe, expect, it } from 'vitest';
import { mergeTarget, prHeadBranch, readHookEvent } from './claude-hook.ts';

// Without gh, the check that calls this fails open with the note it throws.
describe('prHeadBranch', () => {
  it('throws when gh cannot tell the head branch', () => {
    expect(() => prHeadBranch(process.cwd(), '482', 'otea-no-such-gh')).toThrow(
      'gh could not tell the head branch of PR 482',
    );
  });
});

describe('mergeTarget', () => {
  it.each<[string, string | undefined]>([
    ['gh pr merge', undefined],
    ['gh pr merge --squash --delete-branch', undefined],
    ['gh pr merge 482', '482'],
    ['gh pr merge --squash 482', '482'],
    [
      'gh pr merge https://github.com/acme/api/pull/482 --merge',
      'https://github.com/acme/api/pull/482',
    ],
    ['gh pr merge chg-7/rotate-keys', 'chg-7/rotate-keys'],
    ['gh pr merge --subject "Rotate keys" 482', '482'],
    ['gh pr merge -t "Rotate keys" -b body --repo acme/api 482', '482'],
    ['gh pr merge --body-file=notes.md 482', '482'],
    ['cd api && gh pr merge 482 --squash', '482'],
    ['gh pr merge --auto && gh pr view 9', undefined],
    ['gh pr merge; echo 482', undefined],
    ['git push origin main', undefined],
    ['gh pr view 482', undefined],
  ])('reads %j as %j', (command, target) => {
    expect(mergeTarget(command)).toBe(target);
  });
});

describe('readHookEvent', () => {
  it('reads the cwd and the Bash command of a PreToolUse event', () => {
    const event = { cwd: '/repo', tool_name: 'Bash', tool_input: { command: 'gh pr merge 1' } };

    expect(readHookEvent(JSON.stringify(event))).toEqual({
      cwd: '/repo',
      command: 'gh pr merge 1',
    });
    expect(readHookEvent('{"tool_input":{}}')).toEqual({});
  });

  it('throws on what is not an event, so the check fails open', () => {
    expect(() => readHookEvent('not json')).toThrow();
    expect(() => readHookEvent('null')).toThrow('the hook event is not an object');
  });
});
