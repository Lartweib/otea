import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import type { LayoutEntry } from '../../types.ts';
import { attachHint } from './EvidenceModule.tsx';

afterEach(() => setLanguage('en'));

// An empty blind A and B said agents attach «uno de antes y otro de después» (P5-R2-3).
describe('what an empty evidence module asks the agent for', () => {
  const compare = { id: 'ab', module: 'images', variant: 'compare' } as LayoutEntry;

  it('asks a blind compare for A and B, never before and after', () => {
    setLanguage('es');
    const said = attachHint({ ...compare, blind: true } as LayoutEntry);
    expect(said).toContain('A y B');
    expect(said).not.toMatch(/antes|después/);
    setLanguage('en');
    expect(attachHint({ ...compare, blind: true } as LayoutEntry)).not.toMatch(/before|after/);
  });

  it('asks a plain compare for before and after', () => {
    setLanguage('es');
    expect(attachHint(compare)).toContain('uno de antes y otro de después');
  });
});
