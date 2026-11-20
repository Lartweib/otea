import type { Platform } from '../home-screen.ts';

// Whether, and how, to offer installing Otea on the phone's home screen:
// - never in the installed app (display-mode standalone, or Safari's navigator.standalone), nor on
//   the desk;
// - the browser's own prompt where it fired (beforeinstallprompt: Chromium on HTTPS, the Tailscale
//   name), behind a button of Otea's;
// - elsewhere (the LAN's plain HTTP, Safari on iOS, other browsers) the steps for this browser;
// - once the person says no, the banner never comes back: Preferencias offers it again (`again`).

export type InstallOffer = 'none' | 'prompt' | 'ios' | 'android' | 'other';

export type InstallPlace = {
  phone: boolean;
  standalone: boolean;
  platform: Platform;
  // The browser handed Otea its install prompt (beforeinstallprompt).
  canPrompt: boolean;
  // The person dismissed the banner (or the pairing screen's hint) on this browser.
  dismissed: boolean;
};

export function installOffer(
  place: InstallPlace,
  { again = false }: { again?: boolean } = {},
): InstallOffer {
  if (!place.phone || place.standalone) return 'none';
  if (place.dismissed && !again) return 'none';
  if (place.canPrompt) return 'prompt';
  return place.platform;
}
