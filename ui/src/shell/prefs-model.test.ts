import { describe, expect, it } from 'vitest';
import { motionNote, prefsScope } from './prefs-model.ts';

describe('the motion note', () => {
  it('says what the system chose while it follows the system', () => {
    expect(motionNote('system', false)).toBe('system-full');
    expect(motionNote('system', true)).toBe('system-reduced');
  });
});

describe('what the preferences belong to', () => {
  it('names the browser while Otea runs in a tab', () => {
    expect(prefsScope({ phone: true, standalone: false })).toBe('prefs.scope');
    expect(prefsScope({ phone: false, standalone: false })).toBe('prefs.scope');
  });

  it('names the phone, not a browser, in the installed app on a phone', () => {
    expect(prefsScope({ phone: true, standalone: true })).toBe('prefs.scopePhone');
  });

  it('names the computer in the app installed there', () => {
    expect(prefsScope({ phone: false, standalone: true })).toBe('prefs.scopeComputer');
  });
});
