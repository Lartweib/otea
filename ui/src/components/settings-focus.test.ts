import { describe, expect, it } from 'vitest';
import { focusSettings, settingsSectionId, takeSettingsFocus } from './settings-focus.ts';

// Preferencias leads to one section of Configuración: the section asked for is taken once, by the
// page that scrolls to it, and is then forgotten.
describe('the Configuración section asked for', () => {
  it('is taken once', () => {
    focusSettings('phone');
    expect(takeSettingsFocus()).toBe('phone');
    expect(takeSettingsFocus()).toBeNull();
  });

  it('has an id on the page', () => {
    expect(settingsSectionId('phone')).toBe('settings-phone');
  });
});
