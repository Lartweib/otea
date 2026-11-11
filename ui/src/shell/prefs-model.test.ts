import { describe, expect, it } from 'vitest';
import { motionNote } from './prefs-model.ts';

describe('the motion note', () => {
  it('says what the system chose while it follows the system', () => {
    expect(motionNote('system', false)).toBe('system-full');
    expect(motionNote('system', true)).toBe('system-reduced');
  });

  it('says what each choice does', () => {
    expect(motionNote('full', true)).toBe('full');
    expect(motionNote('reduced', false)).toBe('reduced');
  });
});
