import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { SettingsSignIn } from './ProjectSettings.tsx';

// Configuración without a session: the rail keeps its row, and the page says at its top how to
// sign in, so nobody takes it for gone or broken.

afterEach(() => setLanguage('en'));

const html = (session: { canConfigure: boolean; canWrite: boolean }) =>
  renderToStaticMarkup(createElement(SettingsSignIn, session));

describe('the sign-in notice at the top of Configuración', () => {
  it('says how to sign this browser in, with otea open', () => {
    setLanguage('es');
    const out = html({ canConfigure: false, canWrite: false });
    expect(out).toContain('role="note"');
    expect(out).toContain('class="pj-signin"');
    expect(out).toContain('Inicia sesión en este navegador');
    expect(out).toContain('<code class="pj-code">otea open</code>');
  });

  it('tells a paired phone or tablet that only the computer changes it', () => {
    setLanguage('en');
    const out = html({ canConfigure: false, canWrite: true });
    expect(out).toContain('Settings change only in the browser of the computer Otea runs on');
    expect(out).not.toContain('otea open');
  });

  it('is gone once the browser may configure', () => {
    expect(html({ canConfigure: true, canWrite: true })).toBe('');
  });
});
