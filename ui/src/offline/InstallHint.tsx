import { useState } from 'react';
import { isStandalone, type Platform, platformOf } from '../home-screen.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/Icon.tsx';
import { canPromptInstall, here, offlineCapable, promptInstall } from './register.ts';

// Preferencias on the phone, over HTTPS and not yet installed: a discreet line to add Otea to the
// home screen, the way this phone does it. Over the local network's plain HTTP the installed app
// could not open without the PC, so the line promises nothing there and is not shown.

export type InstallLineProps = {
  platform: Platform;
  // Android's own prompt is at hand: the line is a button.
  prompt: boolean;
  onPrompt: () => void;
};

export function InstallLine({ platform, prompt, onPrompt }: InstallLineProps) {
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
      <p className="gnote">{t('offline.install.why')}</p>
    </>
  );
}

// Whether the line belongs here: a phone, over HTTPS, in the browser rather than the installed app.
export function wantsInstallLine(phone: boolean): boolean {
  if (!phone || typeof window === 'undefined') return false;
  return offlineCapable(here()) && !isStandalone(window.matchMedia, navigator);
}

export function InstallHint() {
  const [prompt, setPrompt] = useState(canPromptInstall);
  return (
    <InstallLine
      platform={platformOf(navigator.userAgent, navigator.maxTouchPoints)}
      prompt={prompt}
      onPrompt={() => {
        promptInstall();
        setPrompt(false);
      }}
    />
  );
}
