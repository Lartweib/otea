import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { PrefsBody } from './Preferences.tsx';
import { renderIn, testApp } from './test-app.ts';

afterEach(() => setLanguage('en'));

const body = (canManageDevices = true) => {
  setLanguage('es');
  return renderIn(
    testApp({ session: { canWrite: true, canConfigure: true, canManageDevices } }),
    createElement(PrefsBody, { server: '127.0.0.1:4615', onPair: () => undefined }),
  );
};

describe('Preferences', () => {
  it('heads with you and whose preferences these are', () => {
    expect(body()).toMatch(
      /class="phead" data-i="">.*<b>Preferencias<\/b><small>este navegador<\/small>/,
    );
  });

  it('groups theme, motion, handoff, language, session and about, in that order', () => {
    const labels = [...body().matchAll(/<span class="gl">([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(labels).toEqual(['tema', 'movimiento', 'traspaso', 'idioma', 'sesión', 'acerca de']);
  });

  it('offers each choice as a segmented switch, the current one checked', () => {
    const html = body();
    expect(html).toMatch(/role="radio" aria-checked="true" class="on">.*Sistema/);
    for (const word of [
      'Claro',
      'Oscuro',
      'Completo',
      'Reducido',
      'Plegar',
      'Deslizar',
      'English',
      'Español',
    ]) {
      expect(html).toContain(word);
    }
    expect(html).toContain('Auto · ');
  });

  it('says what the motion choice does and that only the interface is translated', () => {
    const html = body();
    expect(html).toContain('Sigue al sistema: ahora <b>completo</b>.');
    expect(html).toContain('<b>Solo se traduce la interfaz.</b> El contenido de los ítems');
  });

  it('pairs a phone only where this browser may, and names the server', () => {
    expect(body()).toContain('Emparejar un teléfono…');
    expect(body(false)).not.toContain('Emparejar un teléfono…');
    expect(body()).toMatch(/<dt>servidor<\/dt><dd>127.0.0.1:4615<\/dd>/);
  });
});
