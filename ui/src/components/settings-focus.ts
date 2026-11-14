// The section of Configuración another surface leads to (Preferencias leads to Teléfono): asked
// for on the way there, taken once by the page when it has drawn its sections, then forgotten.
export type SettingsSection = 'phone';

let pending: SettingsSection | null = null;

export function focusSettings(section: SettingsSection): void {
  pending = section;
}

export function takeSettingsFocus(): SettingsSection | null {
  const section = pending;
  pending = null;
  return section;
}

export function settingsSectionId(section: SettingsSection): string {
  return `settings-${section}`;
}
