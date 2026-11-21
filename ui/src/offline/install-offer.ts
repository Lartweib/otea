import type { Platform } from '../home-screen.ts';

// Whether, and how, to offer installing Otea on the phone's home screen:
// - never in the installed app (display-mode standalone, or Safari's navigator.standalone), nor on
//   the desk;
// - the browser's own prompt where it fired (beforeinstallprompt: Chromium on HTTPS, the Tailscale
//   name), behind a button of Otea's;
// - elsewhere (the LAN's plain HTTP, Safari on iOS, other browsers) the steps for this browser;
// - once the person says no, or once Otea is installed on this phone (a browser tab shares the
//   app's storage), the banner never comes back: Preferencias offers it again (`again`).

export type InstallOffer = 'none' | 'prompt' | 'ios' | 'android' | 'other';

export type InstallPlace = {
  phone: boolean;
  standalone: boolean;
  platform: Platform;
  // The browser handed Otea its install prompt (beforeinstallprompt).
  canPrompt: boolean;
  // The person dismissed the banner on this browser.
  dismissed: boolean;
  // Otea ran installed on this phone, or the browser said it installed it (home-screen.ts).
  installed: boolean;
};

export function installOffer(
  place: InstallPlace,
  { again = false }: { again?: boolean } = {},
): InstallOffer {
  if (!place.phone || place.standalone) return 'none';
  if (place.dismissed && !again) return 'none';
  // Chrome fires its prompt only while the app is not installed: that wins over what was noted.
  if (place.canPrompt) return 'prompt';
  if (place.installed && !again) return 'none';
  return place.platform;
}
