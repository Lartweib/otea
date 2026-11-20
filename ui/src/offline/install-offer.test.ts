import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { InstallBannerView } from './InstallBanner.tsx';
import { type InstallPlace, installOffer } from './install-offer.ts';

afterEach(() => setLanguage('en'));

const place = (over: Partial<InstallPlace> = {}): InstallPlace => ({
  phone: true,
  standalone: false,
  platform: 'android',
  canPrompt: false,
  dismissed: false,
  ...over,
});

describe('installOffer', () => {
  it('offers nothing once Otea runs installed, on the desk, or after the person said no', () => {
    expect(installOffer(place({ standalone: true }))).toBe('none');
    expect(installOffer(place({ phone: false }))).toBe('none');
    expect(installOffer(place({ dismissed: true }))).toBe('none');
    expect(installOffer(place({ dismissed: true, canPrompt: true }))).toBe('none');
  });

  it('uses the browser’s own prompt where it fired (Chrome on HTTPS)', () => {
    expect(installOffer(place({ canPrompt: true }))).toBe('prompt');
  });

  it('shows the steps for this browser where there is no prompt', () => {
    expect(installOffer(place({ platform: 'ios' }))).toBe('ios');
    expect(installOffer(place({ platform: 'android' }))).toBe('android');
    expect(installOffer(place({ platform: 'other' }))).toBe('other');
  });

  it('offers it again from Preferencias even once dismissed', () => {
    expect(installOffer(place({ dismissed: true }), { again: true })).toBe('android');
    expect(installOffer(place({ standalone: true }), { again: true })).toBe('none');
  });
});

describe('the install banner', () => {
  const banner = (offer: Parameters<typeof InstallBannerView>[0]['offer']) =>
    renderToStaticMarkup(
      createElement(InstallBannerView, { offer, onInstall: () => {}, onDismiss: () => {} }),
    );

  it('says «Instalar Otea en tu inicio» and installs with the browser’s prompt', () => {
    setLanguage('es');
    const html = banner('prompt');
    expect(html).toContain('Instalar Otea en tu inicio');
    expect(html).toMatch(/<button[^>]*>Instalar<\/button>/);
    expect(html).toMatch(/<button[^>]*>Ahora no<\/button>/);
  });

  it('on iPhone, gives Safari’s steps and says notifications need it installed first', () => {
    setLanguage('es');
    const html = banner('ios');
    expect(html).toContain('Compartir');
    expect(html).toContain('Agregar a inicio');
    expect(html).toContain('los avisos');
    expect(html).not.toMatch(/>Instalar<\/button>/);
  });

  it('on Android without the prompt, gives Chrome’s menu', () => {
    const html = banner('android');
    expect(html).toContain('⋮');
    expect(html).toContain('Add to Home screen');
  });

  it('elsewhere, points at the browser’s menu', () => {
    setLanguage('es');
    expect(banner('other')).toContain('menú del navegador');
  });

  it('shows nothing when there is nothing to offer', () => {
    expect(banner('none')).toBe('');
  });
});
