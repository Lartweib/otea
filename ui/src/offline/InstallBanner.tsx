import { useEffect, useState } from 'react';
import { useApp } from '../app/context.tsx';
import {
  browserStore,
  dismissHint,
  hintDismissed,
  isStandalone,
  platformOf,
} from '../home-screen.ts';
import { type PlainKey, t } from '../i18n/i18n.ts';
import { Button } from '../kit/index.ts';
import { type InstallOffer, installOffer } from './install-offer.ts';
import { canPromptInstall, onInstallPrompt, promptInstall } from './register.ts';

// The phone's first open in the browser: a small banner, «Instalar Otea en tu inicio», over the
// tab bar. With the browser's own prompt it installs in one tap; elsewhere it gives this browser's
// steps. Dismissed once, it stays gone on this browser (Preferencias offers it again); inside the
// installed app it never shows. On iPhone it says notifications need Otea on the Home Screen.

const STEPS: Record<Exclude<InstallOffer, 'none' | 'prompt'>, PlainKey> = {
  ios: 'install.ios',
  android: 'install.android',
  other: 'install.other',
};

export type InstallBannerViewProps = {
  offer: InstallOffer;
  onInstall: () => void;
  onDismiss: () => void;
};

export function InstallBannerView({ offer, onInstall, onDismiss }: InstallBannerViewProps) {
  if (offer === 'none') return null;
  return (
    <aside className="install-banner" aria-labelledby="install-banner-title">
      <h2 id="install-banner-title">{t('install.title')}</h2>
      <p>{offer === 'prompt' ? t('install.prompt') : t(STEPS[offer])}</p>
      {offer === 'ios' ? <p className="install-note">{t('install.iosPush')}</p> : null}
      {offer === 'prompt' ? null : <p className="install-note">{t('install.again')}</p>}
      <div className="install-acts">
        {offer === 'prompt' ? (
          <Button size="sm" variant="primary" onClick={onInstall}>
            {t('install.install')}
          </Button>
        ) : null}
        <Button size="sm" variant="quiet" onClick={onDismiss}>
          {offer === 'prompt' ? t('install.later') : t('home.dismiss')}
        </Button>
      </div>
    </aside>
  );
}

export function InstallBanner() {
  const app = useApp();
  const [dismissed, setDismissed] = useState(() => hintDismissed(browserStore()));
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  useEffect(() => onInstallPrompt(() => setCanPrompt(canPromptInstall())), []);
  const offer = installOffer({
    phone: app.phone,
    standalone: isStandalone(window.matchMedia, navigator),
    platform: platformOf(navigator.userAgent, navigator.maxTouchPoints),
    canPrompt,
    dismissed,
  });
  const dismiss = () => {
    dismissHint(browserStore());
    setDismissed(true);
  };
  return (
    <InstallBannerView
      offer={offer}
      onInstall={() => {
        promptInstall();
        dismiss();
      }}
      onDismiss={dismiss}
    />
  );
}
