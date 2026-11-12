import { describe, expect, it } from 'vitest';
import { reportSetupLeft, setupLeftOf } from './setup-left.ts';

// "N por configurar" on the home's pair row: the editor reports how many rows of its "Qué falta
// configurar" checklist are still open for a pair; the home reads it back.

describe('what is left to set up', () => {
  it('is what the editor reported last, per board', () => {
    reportSetupLeft('ch', 3);
    reportSetupLeft('ch', 2);
    expect(setupLeftOf('ch')).toBe(2);
    expect(setupLeftOf('other')).toBe(0);
  });

  it('is nothing once the checklist is done or hidden', () => {
    reportSetupLeft('ch', 2);
    reportSetupLeft('ch', 0);
    expect(setupLeftOf('ch')).toBe(0);
  });
});
