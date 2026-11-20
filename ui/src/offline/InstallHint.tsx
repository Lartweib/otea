import { useEffect, useState } from 'react';
import { isStandalone, type Platform, platformOf } from '../home-screen.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/Icon.tsx';
import {
  canPromptInstall,
  here,
  offlineCapable,
  onInstallPrompt,
  promptInstall,
} from './register.ts';

// Preferencias on the phone, in the browser rather than the installed app: a discreet line to add
// Otea to the home screen, the way this phone does it. It is where the first open's banner is
// offered again once dismissed (InstallBanner.tsx). Over the local network's plain HTTP the
// installed app cannot open without the PC, so there the line promises nothing more.

export type InstallLineProps = {
  platform: Platform;
  // Android's own prompt is at hand: the line is a button.
  prompt: boolean;
  // Over HTTPS, with a service worker: the installed app opens without the PC.
  offline: boolean;
  onPrompt: () => void;
};

export function InstallLine({ platform, prompt, offline, onPrompt }: InstallLineProps) {
  const how =
    platform === 'ios'
      ? t('offline.install.ios')
      : platform === 'android' && !prompt
        ? t('offline.install.android')
        : null;
  return (
    <>
      {prompt ? (
        <button type="button" className="plink" onClick={onPrompt}>
          <Icon name="plus" />
          {t('offline.install.add')}
        </button>
      ) : (
        <p className="gnote">
          <b>{t('offline.install.add')}</b>
          {how === null ? null : ` · ${how}`}
        </p>
      )}
      {offline ? <p className="gnote">{t('offline.install.why')}</p> : null}
    </>
  );
}

// Whether the line belongs here: a phone, in the browser rather than the installed app.
export function installLineWanted({ phone, standalone }: { phone: boolean; standalone: boolean }) {
  return phone && !standalone;
}

export function wantsInstallLine(phone: boolean): boolean {
  if (typeof window === 'undefined') return false;
  return installLineWanted({ phone, standalone: isStandalone(window.matchMedia, navigator) });
}

export function InstallHint() {
  const [prompt, setPrompt] = useState(canPromptInstall);
  useEffect(() => onInstallPrompt(() => setPrompt(canPromptInstall())), []);
  return (
    <InstallLine
      platform={platformOf(navigator.userAgent, navigator.maxTouchPoints)}
      prompt={prompt}
      offline={offlineCapable(here())}
      onPrompt={() => {
        promptInstall();
      }}
    />
  );
}
