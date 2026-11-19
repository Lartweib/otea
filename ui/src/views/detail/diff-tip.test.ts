import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { diffOffTipText } from './diff-tip.ts';

// P1-R3-1: the attached diff came from another checkout than the tip handed off on the branch; the
// desk says so under the branch, before the person approves, and what approving keeps.
describe('diffOffTipText', () => {
  afterEach(() => setLanguage('en'));

  it('names the files that differ, the branch and the tip handed off', () => {
    const off = { branch: 'cambio/CAM-5-field', tip: 'a752d6f', files: ['main.go', 'badge.go'] };
    setLanguage('es');
    expect(diffOffTipText(off)).toBe(
      'El diff adjunto no sale de lo entregado en cambio/CAM-5-field (a752d6f): main.go y badge.go no coinciden con esa punta. Aprobar aprueba lo entregado, no el diff.',
    );
    setLanguage('en');
    expect(diffOffTipText(off)).toBe(
      'The attached diff does not come from what was handed off on cambio/CAM-5-field (a752d6f): main.go and badge.go differ from that tip. Approving approves what was handed off, not the diff.',
    );
  });

  it('says one file in the singular', () => {
    setLanguage('es');
    expect(diffOffTipText({ branch: 'feat/x', tip: 'a752d6f', files: ['a.go'] })).toContain(
      'a.go no coincide con esa punta',
    );
  });

  it('names three files at most, and counts the rest', () => {
    const off = { branch: 'feat/x', tip: 'a752d6f', files: ['a', 'b', 'c', 'd', 'e'] };
    setLanguage('es');
    expect(diffOffTipText(off)).toContain('a, b, c y 2 más no coinciden');
    setLanguage('en');
    expect(diffOffTipText(off)).toContain('a, b, c, and 2 more differ');
  });
});
