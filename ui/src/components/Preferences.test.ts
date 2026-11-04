import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { PreferencesPanel } from './Preferences.tsx';

afterEach(() => setLanguage('en'));

const render = (props: Parameters<typeof PreferencesPanel>[0]) =>
  renderToStaticMarkup(createElement(PreferencesPanel, props));

describe('PreferencesPanel', () => {
  it('groups theme, language, session and about, in that order', () => {
    const html = render({ server: 'localhost:4317', onPair: () => undefined });

    const order = ['>theme<', '>language<', '>session<', '>about<'].map((label) =>
      html.indexOf(label),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('offers to pair a phone, leading to the pairing page, to a browser that may', () => {
    const html = render({ server: 'localhost:4317', onPair: () => undefined });

    expect(html).toMatch(/<a[^>]*href="#\/lan"[^>]*>.*Pair a phone…<\/a>/);
  });

  it('leaves the session out for a browser that cannot pair one', () => {
    const html = render({ server: 'localhost:4317' });

    expect(html).not.toContain('Pair a phone');
    expect(html).not.toContain('>session<');
  });

  it('names the server this browser is talking to, and nothing it cannot back', () => {
    const html = render({ server: 'localhost:4317', onPair: () => undefined });

    expect(html).toContain('localhost:4317');
    expect(html).not.toMatch(/sign out/i);
  });

  it('says the new groups in Spanish', () => {
    setLanguage('es');
    const html = render({ server: 'localhost:4317', onPair: () => undefined });

    expect(html).toContain('>sesión<');
    expect(html).toContain('>acerca de<');
    expect(html).toContain('>servidor<');
    expect(html).toContain('Emparejar un teléfono…');
  });
});
