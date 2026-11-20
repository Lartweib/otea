import { describe, expect, it } from 'vitest';
import { focusSettings, takeSettingsFocus } from './settings-focus.ts';

// Preferencias leads to one section of Configuración: the section asked for is taken once, by the
// page that scrolls to it, and is then forgotten.
describe('the Configuración section asked for', () => {
  it('is taken once', () => {
    focusSettings('phone');
    expect(takeSettingsFocus()).toBe('phone');
    expect(takeSettingsFocus()).toBeNull();
  });
});
